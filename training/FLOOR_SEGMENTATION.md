# Floor / ground-plane generic obstacle detection

Goal: detect that **something is lying on the floor in front of the walker** even when
that something is none of the 80 COCO classes. Two independent routes are covered here.

| Route | Needs training? | Needs LiDAR? | Status |
|---|---|---|---|
| A. LiDAR RANSAC ground plane (`ground_plane.py`) | No | Yes | **Implemented and unit-tested on synthetic clouds.** Not wired into iOS, not validated on real walks. |
| B. Learned floor-mask segmentation (`train_floor_seg.py`) | Yes | No | **Not launched.** Blocked on a missing RunPod credential. Script and launcher are written and syntax-checked only. |

---

## 1. Launch reality check, 2026-10-26

**No remote training was started. There is no RunPod API key on this machine.** This
section is the evidence, so nobody has to re-derive it.

| Credential source checked | Result |
|---|---|
| `printenv \| grep -i runpod` | nothing; only an unrelated `FE_GITHUB_TOKEN` |
| `~/.runpod`, `~/.runpod.yaml`, `~/.config/runpod*` | do not exist |
| repo `.env*` files | none exist |
| `~/.aws/credentials` | exists, but `aws_access_key_id` and `aws_secret_access_key` are **empty** |
| login keychain (`security find-generic-password -s runpod`) | no entry |
| shell history | one `ssh ...@ssh.runpod.io` line, no key |
| `training/guard/pod_guard.py` | by design reads `RUNPOD_API_KEY` from `/proc/1/environ` **on the pod**, so the key never lived on this Mac |

Previous pod `jgmvyjlozpj1pl`: `desiredStatus: EXITED` (verified 2026-10-17 06:48 UTC,
`~/.jcode/scratch/runpod-jgmvyjlozpj1pl/provider-stop-verification.json`), SSH to
`63.141.33.148:22109` now times out. It had a 100GB container disk and **no persistent
volume**, so its filesystem is gone. Only the 79-file mirrored snapshot survives locally.

`https://api.runpod.io/graphql` is reachable and returns HTTP 400 without a key, so the
API path is fine. The credential is the only missing piece.

Dataset reality: `prepare_coco.py` downloads COCO **detection** annotations only, 80 thing
classes, no masks. There is no COCO-Stuff, no ADE20K, and no floor label anywhere in the
repo. Nothing existed that could have trained a floor model unattended tonight.

## 2. To launch route B once a key exists

```sh
export RUNPOD_API_KEY=...                       # never commit this
python3 training/launch_floor_run.py            # read-only preflight, prints live prices
```

Preflight verifies the credential, lists the cheapest available on-demand GPUs **from the
provider**, picks one, and prints a cost estimate. It creates nothing. To actually launch:

```sh
python3 training/launch_floor_run.py --create --confirm-spend-usd 6
```

`--create` refuses to run when the estimate exceeds `--confirm-spend-usd`, and refuses a
volume under 10GB because without a persistent volume the weights die when the pod stops
(exactly what happened to `jgmvyjlozpj1pl`).

### Cost estimate, stated as an estimate

Community-cloud on-demand rates were around **$0.30-0.80/hr** for a 4090 / A5000 / 3090
class card when this document was written, and the verified rate on the previous A5000 pod
was **$0.284/hr** GPU plus container. The launcher quotes the live figure instead of
trusting these.

- GPU: one 4090 or A5000, 24GB, far more than segformer-b0 at 512px needs.
- Work: 8 epochs over a 4,000-image ADE20K subset, batch 8, 512x512, FP16.
- Wall clock: **budgeted 4 hours**, enforced by `--max-hours` in the training script,
  which stops at a clean epoch boundary.
- Expected total: **roughly $1.20 to $3.20**, plus volume storage at about
  $0.10/GB/month pro-rated.
- Throughput on that GPU was **never measured**, so the hour figure is a budget, not a
  prediction. The script writes `metrics.json` after every epoch, so a run that is slower
  than budgeted still leaves usable partial results.

### After launch, required follow-ups

1. Copy `training/train_floor_seg.py` to `/workspace/floorseg/` on the pod. The bootstrap
   command starts it but does not fetch it.
2. **Arm a budget guard for the new pod id before leaving it unattended.** Adapt
   `training/guard/pod_guard.py`, whose `POD_ID` and deadlines are hardcoded to the old
   pod. An unattended pod with no guard bills until someone notices.
3. Record pod id, launch time, chosen GPU and rate in this file.

### How to check status

```sh
# Replace POD with the real id.
python3 - <<'PY'
import json, os, urllib.parse, urllib.request
key = os.environ['RUNPOD_API_KEY']; pod = 'POD'
q = 'query { pod(input: {podId: "%s"}) { id desiredStatus costPerHr runtime { uptimeInSeconds } } }' % pod
url = 'https://api.runpod.io/graphql?api_key=' + urllib.parse.quote(key, safe='')
r = urllib.request.Request(url, json.dumps({'query': q}).encode(), {'Content-Type': 'application/json'})
print(json.dumps(json.load(urllib.request.urlopen(r, timeout=20)), indent=2))
PY

ssh -p PORT -i ~/.ssh/id_ed25519 root@HOST 'tail -40 /workspace/floorseg/train.log'
```

### How to fetch weights and get ONNX

The training script already exports ONNX itself and writes `onnx_parity.json`. Fetch:

```sh
scp -P PORT -i ~/.ssh/id_ed25519 \
  'root@HOST:/workspace/floorseg/artifacts/{best.pt,metrics.json,floor_seg.onnx,onnx_parity.json}' .
```

Verify before believing anything: `metrics.json` must show a real per-epoch floor IoU
curve, and `onnx_parity.json` `parity_ok` must be true. Parity is runtime agreement only
and is not an accuracy claim. **Do not bundle a model into the iOS app on the strength of
IoU alone.** ADE20K indoor scenes are not this app's camera domain, and the existing
TensorFlow.js runtime cannot load an ONNX file directly, which is the same constraint that
blocked the YOLOX experiment (see `README.md`).

Stop billing as soon as artifacts are mirrored:
`mutation { podStop(input: {podId: "POD"}) { id desiredStatus } }`. `EXITED` is an accepted
desired state, **not** proof that billing stopped. Confirm in the provider console.

---

## 3. Route A: LiDAR RANSAC ground plane, no training required

This is the honest answer for "an object on the floor that COCO cannot name", and it works
on LiDAR iPhones **today** with no model, no download and no GPU. Implemented in
[`ground_plane.py`](./ground_plane.py), tested in `tests/test_ground_plane.py`.

### Math

A plane is the set of points satisfying

$$\mathbf{n} \cdot \mathbf{p} + d = 0, \qquad \lVert \mathbf{n} \rVert = 1$$

and the signed distance of a point to it is

$$\operatorname{dist}(\mathbf{p}) = \mathbf{n} \cdot \mathbf{p} + d .$$

Orient $\mathbf{n}$ toward "up" and that signed distance *is* height above the floor:
positive for an object resting on it, negative for a step down or a pothole. The floor is
never assumed to be at $y = 0$.

**RANSAC.** For each of $K$ iterations, sample three points, form
$\mathbf{n} = (\mathbf{p}_1 - \mathbf{p}_0) \times (\mathbf{p}_2 - \mathbf{p}_0)$,
normalise, set $d = -\mathbf{n} \cdot \mathbf{p}_0$, and score the hypothesis by the inlier
count $\lvert \{ \mathbf{p} : \lvert \operatorname{dist}(\mathbf{p}) \rvert \le \tau \} \rvert$
with $\tau \approx 3\,\mathrm{cm}$. Near-collinear triples are skipped. Keep the best.

**Gravity prior.** Reject any hypothesis whose normal is more than $\theta_{\max}$
(default 25 degrees) from the device's gravity-up vector. Without this, a corridor wall or a
large tabletop frequently wins on raw inlier count. The test
`test_gravity_prior_rejects_dominant_wall` builds a wall with more than twice the floor's
points and shows the naive fit locks onto the wall while the guided fit stays on the floor.

**Least-squares refit.** A 3-point normal is noisy. Centre the inlier set at its centroid
$\mathbf{c}$ and minimise

$$\sum_{i \in I} \left( \mathbf{n} \cdot (\mathbf{p}_i - \mathbf{c}) \right)^2
\quad \text{s.t.} \quad \lVert \mathbf{n} \rVert = 1,$$

whose solution is the right singular vector of the centred inlier matrix with the smallest
singular value. Then $d = -\mathbf{n} \cdot \mathbf{c}$. This is the orthogonal-distance
(total least squares) plane fit, not an ordinary $y$-on-$(x,z)$ regression, so it stays
well-conditioned for steep surfaces.

**Obstacle gating.** A point is an obstacle candidate when

$$h_{\min} \le \operatorname{dist}(\mathbf{p}) \le h_{\max}, \qquad
0 < p_z \le R, \qquad \lvert p_x \rvert \le W .$$

Defaults: $h_{\min} = 4\,\mathrm{cm}$ (above depth noise), $h_{\max} = 1.6\,\mathrm{m}$
(ignore ceilings and overhead signage you walk under), $R = 4\,\mathrm{m}$ warning range,
$W = 0.8\,\mathrm{m}$ walking corridor half-width.

**Clustering.** Build an orthonormal in-plane basis $(\mathbf{u}, \mathbf{v})$ by taking the
world axis least aligned with $\mathbf{n}$, projecting $\mathbf{n}$ out of it, normalising to
get $\mathbf{u}$, then $\mathbf{v} = \mathbf{n} \times \mathbf{u}$. Project candidates to
$(\mathbf{u} \cdot \mathbf{p}, \mathbf{v} \cdot \mathbf{p})$ and take single-linkage connected
components at a 12cm radius. Clustering **in 2D floor coordinates, not 3D**, is deliberate:
a sign post and the bag at its base merge into one obstacle instead of splitting by height
(`test_pole_and_bag_at_its_base_merge_into_one_obstacle`). Clusters under 8 points are
dropped as speckle.

Complexity is $O(KN)$ for the fit and $O(M^2)$ for clustering over the $M$ surviving
candidates. Voxel-downsample at a 4cm leaf first and $M$ stays in the low thousands.

### Pseudocode for the iOS port

```swift
let depth  = frame.sceneDepth!.depthMap          // metric, LiDAR devices only
let conf   = frame.sceneDepth!.confidenceMap
var points = unproject(depth, where: conf >= .medium, frame.camera.intrinsics)
points     = voxelDownsample(points, leaf: 0.04)

// Column 1 of the camera transform is camera-up; negate per your frame convention.
let up    = simd_normalize(simd_make_float3(frame.camera.transform.columns.1))
let plane = ransacPlane(points, tol: 0.03, iterations: 200, gravityUp: up, maxTiltDeg: 25)

guard plane.inlierRatio >= 0.25 else { return [] }   // no trustworthy floor: say nothing

let obstacles = extractObstacles(points, plane,
                                 minHeight: 0.04, maxHeight: 1.6,
                                 corridorHalfWidth: 0.8, maxRange: 4.0,
                                 clusterRadius: 0.12, minPoints: 8)
// Sorted nearest-first. Feed the nearest few into the existing proximity/haptic
// layer alongside the COCO detector's named boxes. Announce unnamed ones as
// "obstacle ahead, 1.8 metres", never as a guessed class.
```

### Honest limits of route A

- **Requires metric depth.** ARKit `sceneDepth` on LiDAR iPhones, or `ARMeshAnchor`
  vertices. Monocular depth is relative and needs scale before any height threshold means
  anything.
- **One dominant plane.** Ramps, stair flights, multi-level floors and strong camera roll
  violate the model. `inlier_ratio` is returned so the caller can refuse a bad fit;
  `detect_floor_obstacles` returns an **empty** list below `min_inlier_ratio` rather than
  reporting boxes measured against a wall.
- **Geometry, not semantics.** It cannot say *what* the obstacle is, only that volume is
  occupied above the floor in your path. That is the point, and it is also the limit.
- **Tested on synthetic clouds only.** All 23 tests pass, but they verify the documented
  geometry and gating. **No real recorded walk, no real ARKit frame and no device test has
  been run.** There is no measured recall, no false-positive rate, and this is not a
  safety-certified navigation system.

### Validation

```sh
python3 -m unittest discover -s training/tests -p 'test_ground_plane*' -v   # 23 tests
python3 -m unittest discover -s training/tests                             # full suite
```
