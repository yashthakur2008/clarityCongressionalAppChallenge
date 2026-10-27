#!/usr/bin/env python3
"""Reference implementation: LiDAR ground-plane fit -> generic obstacle boxes.

This is a NON-ML, no-training algorithm. It detects "something is lying on the
floor ahead of you" without any object class, so it covers obstacles that the
80-class COCO detector can never name (a backpack strap, a cable, a step stool,
a spill tray, a pothole lip, a curb).

Scope and honest limits
-----------------------
- This module is a CPU reference for the iOS side to port. It is NOT wired into
  the iOS app and makes no claim about measured on-device accuracy.
- It requires a metric depth point cloud. On iPhone that means ARKit
  `ARFrame.sceneDepth` (LiDAR models) unprojected to camera-space points, or
  `ARMeshAnchor` vertices. Monocular depth is relative, not metric, and would
  need scale before the height thresholds below mean anything.
- Correctness here means "the geometry is implemented as documented and tested
  on synthetic scenes". It is not a validated safety system. Nothing in this
  file has been evaluated against real recorded walks.
- A plane fit describes one dominant flat surface. Ramps, stair flights,
  multi-level floors and strong camera roll violate the single-plane model.
  `inlier_ratio` is reported so a caller can reject a bad fit rather than
  trusting boxes derived from it.

Coordinate convention
---------------------
Input points are in a right-handed camera/world frame as a float array of shape
(N, 3) with columns (x, y, z):

- x: right, metres
- y: up, metres (not required to be gravity-aligned; the plane fit finds the
  floor regardless, and gravity is only used as an optional prior)
- z: forward, metres, positive in front of the walker

The algorithm never assumes the floor is exactly y = 0.

Math
----
A plane is the set of points p satisfying

    n . p + d = 0,          with ||n|| = 1

where n is the unit normal and d the signed offset. The signed distance of a
point p to the plane is

    dist(p) = n . p + d

which is positive on the side the normal points toward. We orient n so that the
"up" half-space is positive, hence an object resting on the floor has small
positive distances and a hole/step-down has negative distances.

RANSAC
~~~~~~
Repeat `iterations` times:

1. Sample 3 distinct points p0, p1, p2 uniformly at random.
2. n = (p1 - p0) x (p2 - p0), normalise. Skip near-degenerate samples where
   ||n|| is tiny (collinear triples).
3. d = -n . p0
4. Score = number of points with |dist(p)| <= `plane_tol`.
5. Keep the best-scoring hypothesis.

Optional gravity prior: a candidate is rejected when the angle between its
normal and the supplied gravity-up vector exceeds `max_tilt_deg`. This stops
RANSAC from locking onto a large wall or tabletop, which is the most common
failure mode in a corridor.

Least-squares refit
~~~~~~~~~~~~~~~~~~~
The 3-point hypothesis is noisy. After selecting the best inlier set I we refit
by total least squares: centre the inliers at their centroid c, and take the
singular vector of the centred matrix with the smallest singular value. That
vector minimises sum over I of (n . (p - c))^2 subject to ||n|| = 1, which is
exactly the orthogonal-distance plane fit. Then d = -n . c.

Obstacle extraction
~~~~~~~~~~~~~~~~~~~
Given the refined plane, a point is an obstacle candidate when all hold:

- height = dist(p) is in [`min_obstacle_height`, `max_obstacle_height`].
  The lower bound rejects floor noise and texture; the upper bound rejects
  ceilings and overhead signage that you can walk under.
- 0 < z <= `max_range`: ahead of the walker, within useful warning distance.
- |x| <= `corridor_half_width`: inside the walking corridor. A shelf two metres
  to the side is not a trip hazard.

Surviving points are clustered by single-linkage connectivity on the floor
plane: two points join the same cluster when their in-plane separation is
<= `cluster_radius`. We deliberately cluster in 2D floor coordinates, not 3D,
so a tall thin pole and the bag at its base merge into one obstacle rather than
splitting by height. Clusters with fewer than `min_cluster_points` points are
dropped as noise.

In-plane coordinates are obtained with an orthonormal basis (u, v) of the
plane: pick the world axis least aligned with n, project it out of n, normalise
to get u, then v = n x u. For a point p, its floor coordinates are
(u . (p - c), v . (p - c)).

Complexity
~~~~~~~~~~
RANSAC is O(iterations * N) for scoring. Clustering as written is O(M^2) in the
number of candidate points M, which is fine for the few thousand points that
survive the corridor and height gates after voxel downsampling. Downsample
first on device; a uniform voxel grid at 3-5 cm is adequate for trip hazards.

Pseudocode for the iOS port
---------------------------
    depth  = ARFrame.sceneDepth.depthMap          // metric, LiDAR only
    conf   = ARFrame.sceneDepth.confidenceMap
    points = unproject(depth, conf >= .medium, camera.intrinsics)
    points = voxelDownsample(points, leaf: 0.04)
    plane  = ransacPlane(points, tol: 0.03, iterations: 200,
                         gravityUp: -simd_make_float3(frame.camera.transform.columns.1),
                         maxTiltDeg: 25)
    guard plane.inlierRatio >= 0.25 else { return [] }   // no trustworthy floor
    obstacles = extractObstacles(points, plane,
                                 minHeight: 0.04, maxHeight: 1.6,
                                 corridorHalfWidth: 0.8, maxRange: 4.0)
    // obstacles are metric boxes; feed nearest few into the existing
    // proximity/haptic layer alongside the COCO detector's named boxes.

Run `python3 -m unittest discover -s training/tests -p 'test_ground_plane*'`.
"""
from __future__ import annotations

from dataclasses import dataclass, field
import math

import numpy as np

__all__ = [
    'Plane',
    'Obstacle',
    'fit_ground_plane',
    'extract_obstacles',
    'voxel_downsample',
    'detect_floor_obstacles',
]

# A normal shorter than this means the sampled triple was collinear.
_DEGENERATE_NORMAL = 1e-9


@dataclass(frozen=True)
class Plane:
    """A fitted ground plane, oriented so that `up` is the positive side."""

    normal: np.ndarray
    offset: float
    inlier_count: int
    total_points: int

    @property
    def inlier_ratio(self) -> float:
        if self.total_points <= 0:
            return 0.0
        return self.inlier_count / self.total_points

    def signed_distance(self, points: np.ndarray) -> np.ndarray:
        """Signed height of each point above the plane, in metres."""
        pts = _as_points(points)
        return pts @ self.normal + self.offset

    def basis(self) -> tuple[np.ndarray, np.ndarray]:
        """An orthonormal in-plane basis (u, v) with u, v, normal mutually orthogonal."""
        # Choose the world axis least aligned with the normal for numerical safety.
        axis = np.zeros(3)
        axis[int(np.argmin(np.abs(self.normal)))] = 1.0
        u = axis - self.normal * float(self.normal @ axis)
        norm = float(np.linalg.norm(u))
        if norm < _DEGENERATE_NORMAL:  # pragma: no cover - unreachable for unit normals
            raise ValueError('degenerate plane basis')
        u = u / norm
        v = np.cross(self.normal, u)
        return u, v


@dataclass(frozen=True)
class Obstacle:
    """A generic, classless obstacle resting on or near the ground plane."""

    point_count: int
    # Axis-aligned extent in the input frame, metres.
    min_xyz: np.ndarray
    max_xyz: np.ndarray
    # Height above the fitted floor, metres.
    min_height: float
    max_height: float
    # Nearest forward distance of any member point, metres.
    nearest_range: float
    # Lateral offset of the cluster centroid: negative is left, positive right.
    lateral_offset: float
    member_indices: np.ndarray = field(repr=False)

    @property
    def size_xyz(self) -> np.ndarray:
        return self.max_xyz - self.min_xyz


def _as_points(points) -> np.ndarray:
    pts = np.asarray(points, dtype=np.float64)
    if pts.ndim != 2 or pts.shape[1] != 3:
        raise ValueError('points must have shape (N, 3)')
    if not np.isfinite(pts).all():
        raise ValueError('points must be finite; filter invalid depth first')
    return pts


def voxel_downsample(points, leaf: float = 0.04) -> np.ndarray:
    """Keep one representative point per occupied voxel.

    This bounds the cost of the O(M^2) clustering step and removes the density
    bias of a perspective depth map, where near surfaces carry far more points
    per square metre than far ones.
    """
    pts = _as_points(points)
    if leaf <= 0:
        raise ValueError('leaf must be positive')
    if len(pts) == 0:
        return pts
    keys = np.floor(pts / leaf).astype(np.int64)
    # `return_index` on the first occurrence gives a deterministic representative.
    _, index = np.unique(keys, axis=0, return_index=True)
    return pts[np.sort(index)]


def fit_ground_plane(
    points,
    plane_tol: float = 0.03,
    iterations: int = 200,
    gravity_up=None,
    max_tilt_deg: float = 25.0,
    seed: int = 0,
) -> Plane:
    """RANSAC plane fit with least-squares refinement on the inlier set.

    `gravity_up` is an optional unit-ish vector pointing away from the floor. When
    supplied, hypotheses tilted more than `max_tilt_deg` from it are rejected, which
    keeps the fit off walls and tabletops. Without it the largest planar surface
    wins, which in a cluttered room is not necessarily the floor.
    """
    pts = _as_points(points)
    if len(pts) < 3:
        raise ValueError('need at least 3 points to fit a plane')
    if plane_tol <= 0:
        raise ValueError('plane_tol must be positive')
    if iterations < 1:
        raise ValueError('iterations must be >= 1')

    up = None
    if gravity_up is not None:
        up = np.asarray(gravity_up, dtype=np.float64).reshape(3)
        up_norm = float(np.linalg.norm(up))
        if up_norm < _DEGENERATE_NORMAL:
            raise ValueError('gravity_up must be a non-zero vector')
        up = up / up_norm
    cos_limit = math.cos(math.radians(max_tilt_deg))

    rng = np.random.default_rng(seed)
    best_mask = None
    best_count = -1

    for _ in range(iterations):
        sample = rng.choice(len(pts), size=3, replace=False)
        p0, p1, p2 = pts[sample]
        normal = np.cross(p1 - p0, p2 - p0)
        norm = float(np.linalg.norm(normal))
        if norm < _DEGENERATE_NORMAL:
            continue  # collinear triple carries no plane
        normal = normal / norm
        if up is not None:
            # Orient toward up before the tilt test so sign of the sample ordering
            # cannot flip the verdict.
            if normal @ up < 0:
                normal = -normal
            if normal @ up < cos_limit:
                continue
        offset = -float(normal @ p0)
        mask = np.abs(pts @ normal + offset) <= plane_tol
        count = int(mask.sum())
        if count > best_count:
            best_count = count
            best_mask = mask

    if best_mask is None or best_count < 3:
        raise ValueError('RANSAC found no plane; check tolerance, tilt prior or input')

    inliers = pts[best_mask]
    centroid = inliers.mean(axis=0)
    # Total least squares: smallest right singular vector of the centred inliers.
    _, _, vt = np.linalg.svd(inliers - centroid, full_matrices=False)
    normal = vt[-1]
    normal = normal / float(np.linalg.norm(normal))

    if up is not None:
        if normal @ up < 0:
            normal = -normal
    else:
        # Without a gravity prior, orient by majority: most observed points should
        # sit above the floor, not below it.
        offset_probe = -float(normal @ centroid)
        if float(np.sum(pts @ normal + offset_probe > 0)) < len(pts) / 2.0:
            normal = -normal

    offset = -float(normal @ centroid)
    refined = int(np.sum(np.abs(pts @ normal + offset) <= plane_tol))
    return Plane(normal=normal, offset=offset, inlier_count=refined, total_points=len(pts))


def _cluster_2d(coords: np.ndarray, radius: float) -> list[np.ndarray]:
    """Single-linkage connected components under a Euclidean radius.

    O(M^2) by design: it is exact, allocation-light and trivially portable to
    Swift. Downsample before calling if M is large.
    """
    count = len(coords)
    if count == 0:
        return []
    unvisited = np.ones(count, dtype=bool)
    clusters: list[np.ndarray] = []
    radius_sq = radius * radius
    for start in range(count):
        if not unvisited[start]:
            continue
        unvisited[start] = False
        stack = [start]
        members = []
        while stack:
            current = stack.pop()
            members.append(current)
            if not unvisited.any():
                continue
            candidates = np.flatnonzero(unvisited)
            deltas = coords[candidates] - coords[current]
            near = candidates[np.einsum('ij,ij->i', deltas, deltas) <= radius_sq]
            if len(near):
                unvisited[near] = False
                stack.extend(near.tolist())
        clusters.append(np.array(sorted(members), dtype=np.int64))
    return clusters


def extract_obstacles(
    points,
    plane: Plane,
    min_obstacle_height: float = 0.04,
    max_obstacle_height: float = 1.6,
    corridor_half_width: float = 0.8,
    max_range: float = 4.0,
    cluster_radius: float = 0.12,
    min_cluster_points: int = 8,
) -> list[Obstacle]:
    """Cluster above-floor points inside the walking corridor into generic boxes.

    Returned obstacles are sorted by `nearest_range`, nearest first, so a caller
    can warn about the most imminent hazard without re-sorting.
    """
    pts = _as_points(points)
    if min_obstacle_height <= 0:
        raise ValueError('min_obstacle_height must be positive to clear floor noise')
    if max_obstacle_height <= min_obstacle_height:
        raise ValueError('max_obstacle_height must exceed min_obstacle_height')
    if corridor_half_width <= 0 or max_range <= 0:
        raise ValueError('corridor_half_width and max_range must be positive')
    if cluster_radius <= 0:
        raise ValueError('cluster_radius must be positive')
    if len(pts) == 0:
        return []

    height = plane.signed_distance(pts)
    gate = (
        (height >= min_obstacle_height)
        & (height <= max_obstacle_height)
        & (pts[:, 2] > 0.0)
        & (pts[:, 2] <= max_range)
        & (np.abs(pts[:, 0]) <= corridor_half_width)
    )
    selected = np.flatnonzero(gate)
    if len(selected) == 0:
        return []

    u, v = plane.basis()
    candidate_pts = pts[selected]
    # Project onto the floor so height never splits one physical obstacle in two.
    coords = np.stack([candidate_pts @ u, candidate_pts @ v], axis=1)

    obstacles: list[Obstacle] = []
    for members in _cluster_2d(coords, cluster_radius):
        if len(members) < min_cluster_points:
            continue
        original = selected[members]
        cluster_pts = pts[original]
        cluster_height = height[original]
        obstacles.append(
            Obstacle(
                point_count=len(original),
                min_xyz=cluster_pts.min(axis=0),
                max_xyz=cluster_pts.max(axis=0),
                min_height=float(cluster_height.min()),
                max_height=float(cluster_height.max()),
                nearest_range=float(cluster_pts[:, 2].min()),
                lateral_offset=float(cluster_pts[:, 0].mean()),
                member_indices=original,
            )
        )
    obstacles.sort(key=lambda item: item.nearest_range)
    return obstacles


def detect_floor_obstacles(
    points,
    leaf: float = 0.04,
    min_inlier_ratio: float = 0.25,
    gravity_up=None,
    seed: int = 0,
    **kwargs,
) -> tuple[Plane, list[Obstacle]]:
    """Downsample, fit the floor, and return (plane, obstacles).

    When the fitted plane explains less than `min_inlier_ratio` of the cloud, the
    floor is not trustworthy and an EMPTY obstacle list is returned alongside the
    plane. Reporting no obstacles is the honest answer there: boxes measured
    against a wall-shaped "floor" would be actively misleading.
    """
    pts = voxel_downsample(points, leaf=leaf) if leaf else _as_points(points)
    fit_keys = {'plane_tol', 'iterations', 'max_tilt_deg'}
    plane = fit_ground_plane(
        pts,
        gravity_up=gravity_up,
        seed=seed,
        **{k: v for k, v in kwargs.items() if k in fit_keys},
    )
    if plane.inlier_ratio < min_inlier_ratio:
        return plane, []
    obstacles = extract_obstacles(
        pts, plane, **{k: v for k, v in kwargs.items() if k not in fit_keys}
    )
    return plane, obstacles
