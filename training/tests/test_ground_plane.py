#!/usr/bin/env python3
"""Tests for the LiDAR ground-plane obstacle reference.

Every scene is synthetic and deterministic. These tests verify the documented
geometry and gating rules. They do NOT establish real-world detection accuracy.
"""
import math
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ground_plane import (  # noqa: E402
    Plane,
    detect_floor_obstacles,
    extract_obstacles,
    fit_ground_plane,
    voxel_downsample,
)

UP = np.array([0.0, 1.0, 0.0])


def floor_grid(width=3.0, depth=5.0, step=0.05, height=0.0, tilt=0.0, noise=0.0, seed=1):
    """A floor patch, optionally pitched forward by `tilt` radians."""
    xs = np.arange(-width / 2, width / 2, step)
    zs = np.arange(0.2, depth, step)
    gx, gz = np.meshgrid(xs, zs)
    gy = np.full_like(gx, height) + gz * math.tan(tilt)
    pts = np.stack([gx.ravel(), gy.ravel(), gz.ravel()], axis=1)
    if noise:
        pts[:, 1] += np.random.default_rng(seed).normal(0.0, noise, len(pts))
    return pts


def box(center_x, center_z, size_x, size_y, size_z, base=0.0, step=0.03):
    """A solid rectangular obstacle sitting with its base at height `base`."""
    xs = np.arange(center_x - size_x / 2, center_x + size_x / 2 + 1e-9, step)
    ys = np.arange(base, base + size_y + 1e-9, step)
    zs = np.arange(center_z - size_z / 2, center_z + size_z / 2 + 1e-9, step)
    gx, gy, gz = np.meshgrid(xs, ys, zs)
    return np.stack([gx.ravel(), gy.ravel(), gz.ravel()], axis=1)


class PlaneFitTests(unittest.TestCase):
    def test_recovers_level_floor_with_noise(self):
        pts = floor_grid(noise=0.004)
        plane = fit_ground_plane(pts, gravity_up=UP, seed=7)
        # Normal must point up and be within a degree of vertical.
        self.assertGreater(float(plane.normal @ UP), math.cos(math.radians(1.0)))
        self.assertLess(abs(plane.offset), 0.01)
        self.assertGreater(plane.inlier_ratio, 0.99)

    def test_recovers_offset_and_tilted_floor(self):
        tilt = math.radians(8.0)
        pts = floor_grid(height=-1.35, tilt=tilt)
        plane = fit_ground_plane(pts, gravity_up=UP, seed=3)
        angle = math.degrees(math.acos(min(1.0, float(plane.normal @ UP))))
        self.assertAlmostEqual(angle, 8.0, delta=0.5)
        # Points on the surface are at zero height regardless of the offset.
        self.assertLess(float(np.abs(plane.signed_distance(pts)).max()), 0.01)

    def test_gravity_prior_rejects_dominant_wall(self):
        # A wall with roughly twice the floor's point count. Without the prior the
        # wall wins on inlier count; with it the floor must still be chosen.
        floor = floor_grid(width=2.0, depth=3.0, step=0.05)
        wall_y = np.arange(0.0, 2.5, 0.025)
        wall_x = np.arange(-2.0, 2.0, 0.025)
        gx, gy = np.meshgrid(wall_x, wall_y)
        wall = np.stack([gx.ravel(), gy.ravel(), np.full(gx.size, 3.0)], axis=1)
        self.assertGreater(len(wall), 2 * len(floor))
        cloud = np.vstack([floor, wall])

        naive = fit_ground_plane(cloud, seed=5)
        self.assertLess(abs(float(naive.normal @ UP)), 0.2)  # locked onto the wall

        guided = fit_ground_plane(cloud, gravity_up=UP, max_tilt_deg=25.0, seed=5)
        self.assertGreater(float(guided.normal @ UP), math.cos(math.radians(2.0)))

    def test_signed_distance_sign_convention(self):
        plane = fit_ground_plane(floor_grid(), gravity_up=UP, seed=2)
        above = plane.signed_distance(np.array([[0.0, 0.3, 2.0]]))[0]
        below = plane.signed_distance(np.array([[0.0, -0.3, 2.0]]))[0]
        self.assertGreater(above, 0.0)
        self.assertLess(below, 0.0)

    def test_basis_is_orthonormal_and_in_plane(self):
        plane = fit_ground_plane(floor_grid(tilt=math.radians(5.0)), gravity_up=UP, seed=4)
        u, v = plane.basis()
        for vec in (u, v):
            self.assertAlmostEqual(float(np.linalg.norm(vec)), 1.0, places=9)
            self.assertAlmostEqual(float(vec @ plane.normal), 0.0, places=9)
        self.assertAlmostEqual(float(u @ v), 0.0, places=9)

    def test_rejects_malformed_or_nonfinite_input(self):
        with self.assertRaises(ValueError):
            fit_ground_plane(np.zeros((2, 3)))
        with self.assertRaises(ValueError):
            fit_ground_plane(np.zeros((10, 2)))
        bad = floor_grid()
        bad[0, 1] = np.nan
        with self.assertRaises(ValueError):
            fit_ground_plane(bad, gravity_up=UP)

    def test_fit_is_deterministic_for_a_seed(self):
        pts = floor_grid(noise=0.006)
        first = fit_ground_plane(pts, gravity_up=UP, seed=11)
        second = fit_ground_plane(pts, gravity_up=UP, seed=11)
        np.testing.assert_allclose(first.normal, second.normal)
        self.assertEqual(first.inlier_count, second.inlier_count)


class ObstacleTests(unittest.TestCase):
    def setUp(self):
        self.floor = floor_grid(width=3.0, depth=5.0, step=0.04, noise=0.003)
        self.plane = fit_ground_plane(self.floor, gravity_up=UP, seed=9)

    def test_detects_unnamed_object_lying_on_the_floor(self):
        # A 30x12x25 cm slab: no COCO class, but a real trip hazard.
        obstacle = box(center_x=0.1, center_z=1.8, size_x=0.30, size_y=0.12, size_z=0.25)
        cloud = np.vstack([self.floor, obstacle])
        found = extract_obstacles(cloud, self.plane)
        self.assertEqual(len(found), 1)
        hit = found[0]
        self.assertAlmostEqual(hit.max_height, 0.12, delta=0.02)
        self.assertAlmostEqual(hit.nearest_range, 1.8 - 0.125, delta=0.05)
        self.assertAlmostEqual(hit.lateral_offset, 0.1, delta=0.05)
        self.assertAlmostEqual(float(hit.size_xyz[0]), 0.30, delta=0.05)

    def test_empty_floor_yields_no_obstacles(self):
        self.assertEqual(extract_obstacles(self.floor, self.plane), [])

    def test_two_separated_objects_stay_separate_and_sort_by_range(self):
        near = box(-0.3, 1.2, 0.2, 0.2, 0.2)
        far = box(0.35, 3.4, 0.2, 0.3, 0.2)
        cloud = np.vstack([self.floor, near, far])
        found = extract_obstacles(cloud, self.plane, cluster_radius=0.10)
        self.assertEqual(len(found), 2)
        self.assertLess(found[0].nearest_range, found[1].nearest_range)
        self.assertAlmostEqual(found[0].lateral_offset, -0.3, delta=0.06)

    def test_pole_and_bag_at_its_base_merge_into_one_obstacle(self):
        # In-plane clustering is the documented reason these do not split.
        pole = box(0.0, 2.0, 0.06, 1.2, 0.06, step=0.03)
        bag = box(0.08, 2.0, 0.2, 0.15, 0.2, step=0.03)
        cloud = np.vstack([self.floor, pole, bag])
        found = extract_obstacles(cloud, self.plane, cluster_radius=0.12)
        self.assertEqual(len(found), 1)
        self.assertGreater(found[0].max_height, 1.0)

    def test_overhead_sign_is_ignored(self):
        sign = box(0.0, 2.5, 0.6, 0.2, 0.05, base=2.1)
        cloud = np.vstack([self.floor, sign])
        self.assertEqual(extract_obstacles(cloud, self.plane, max_obstacle_height=1.6), [])

    def test_object_outside_the_walking_corridor_is_ignored(self):
        shelf = box(1.4, 2.0, 0.3, 0.5, 0.3)
        cloud = np.vstack([self.floor, shelf])
        self.assertEqual(extract_obstacles(cloud, self.plane, corridor_half_width=0.8), [])
        self.assertEqual(len(extract_obstacles(cloud, self.plane, corridor_half_width=1.8)), 1)

    def test_object_beyond_range_and_behind_the_walker_is_ignored(self):
        far = box(0.0, 7.0, 0.3, 0.3, 0.3)
        behind = box(0.0, -1.5, 0.3, 0.3, 0.3)
        cloud = np.vstack([self.floor, far, behind])
        self.assertEqual(extract_obstacles(cloud, self.plane, max_range=4.0), [])

    def test_floor_noise_below_threshold_is_not_an_obstacle(self):
        noisy = floor_grid(width=3.0, depth=5.0, step=0.04, noise=0.012)
        plane = fit_ground_plane(noisy, gravity_up=UP, seed=6)
        self.assertEqual(extract_obstacles(noisy, plane, min_obstacle_height=0.05), [])

    def test_sparse_speckle_is_dropped_as_noise(self):
        speckle = np.array([[0.0, 0.2, 2.0], [0.01, 0.21, 2.01], [0.02, 0.2, 2.0]])
        cloud = np.vstack([self.floor, speckle])
        self.assertEqual(extract_obstacles(cloud, self.plane, min_cluster_points=8), [])

    def test_invalid_parameters_are_rejected(self):
        for kwargs in (
            {'min_obstacle_height': 0.0},
            {'min_obstacle_height': 0.5, 'max_obstacle_height': 0.4},
            {'corridor_half_width': 0.0},
            {'max_range': -1.0},
            {'cluster_radius': 0.0},
        ):
            with self.subTest(**kwargs):
                with self.assertRaises(ValueError):
                    extract_obstacles(self.floor, self.plane, **kwargs)


class DownsampleTests(unittest.TestCase):
    def test_collapses_duplicates_and_preserves_order(self):
        pts = np.array([[0.0, 0.0, 0.0], [0.001, 0.0, 0.0], [1.0, 0.0, 0.0]])
        out = voxel_downsample(pts, leaf=0.05)
        self.assertEqual(len(out), 2)
        self.assertLess(out[0][0], out[1][0])

    def test_reduces_a_dense_floor_substantially(self):
        pts = floor_grid(step=0.01)
        self.assertLess(len(voxel_downsample(pts, leaf=0.05)), len(pts) / 10)

    def test_empty_and_invalid_leaf(self):
        self.assertEqual(len(voxel_downsample(np.zeros((0, 3)))), 0)
        with self.assertRaises(ValueError):
            voxel_downsample(floor_grid(), leaf=0.0)


class PipelineTests(unittest.TestCase):
    def test_end_to_end_finds_the_slab(self):
        cloud = np.vstack([
            floor_grid(width=3.0, depth=5.0, step=0.02, noise=0.004),
            box(0.0, 2.2, 0.35, 0.10, 0.3, step=0.02),
        ])
        plane, found = detect_floor_obstacles(cloud, gravity_up=UP, seed=13)
        self.assertGreater(plane.inlier_ratio, 0.5)
        self.assertEqual(len(found), 1)
        self.assertAlmostEqual(found[0].max_height, 0.10, delta=0.03)

    def test_untrustworthy_plane_reports_no_obstacles(self):
        # Pure wall: the best plane is vertical, so no floor-relative claim is safe.
        wall_x = np.arange(-1.0, 1.0, 0.02)
        wall_y = np.arange(0.0, 2.0, 0.02)
        gx, gy = np.meshgrid(wall_x, wall_y)
        wall = np.stack([gx.ravel(), gy.ravel(), np.full(gx.size, 2.0)], axis=1)
        # Add scattered clutter so the wall cannot reach the inlier-ratio floor.
        rng = np.random.default_rng(21)
        clutter = rng.uniform([-1.0, 0.0, 0.3], [1.0, 2.0, 1.9], size=(gx.size * 3, 3))
        plane, found = detect_floor_obstacles(
            np.vstack([wall, clutter]), gravity_up=UP, min_inlier_ratio=0.9, seed=17
        )
        self.assertLess(plane.inlier_ratio, 0.9)
        self.assertEqual(found, [])

    def test_plane_dataclass_handles_zero_total(self):
        plane = Plane(normal=UP.copy(), offset=0.0, inlier_count=0, total_points=0)
        self.assertEqual(plane.inlier_ratio, 0.0)


if __name__ == '__main__':
    unittest.main()
