# Clarity · Congressional App Challenge 2026

A camera-based obstacle alert **prototype** being prepared for the 2026 Congressional App Challenge, based on the earlier DAHacks project. Yash is the sole CAC entrant (confirmed October 26). Eligibility, inherited-work rights and individual contributions still require his confirmation; sole entrant does not imply sole authorship of inherited work. StepSense and Clarity names remain in historical materials.

**[Judge quick start and demo guide](docs/JUDGES.md)** · [Native iPhone judge guide](samples/ios/JUDGES.md) · [CAC checklist](docs/demo.md) · [Submission readiness](docs/SUBMISSION_READINESS.md) · [Official 2026 rules](https://www.congressionalappchallenge.us/wp-content/uploads/2026/05/2026-CAC-Rules.pdf)

> **October 26 submission sprint:** the original 17 frontend failures are fixed in [PR #20](https://github.com/yashthakur2008/clarityCongressionalAppChallenge/pull/20). Actual browser online/offline model startup and lifecycle checks passed using a virtual camera. The approved Cloudflare judges URL now serves verified source `df0ebaa`; all 66 public assets match. See the [release evidence](docs/CAC_RELEASE_2026-10-26.md) and [remaining submission gates](docs/SUBMISSION_READINESS.md) before recording.

## Download the mobile apps

**[Android APK, iPhone IPA, and installation instructions](DOWNLOADS.md)** · **[GitHub releases](https://github.com/yashthakur2008/clarityCongressionalAppChallenge/releases)**

The Android demo requires a trusted inference backend and uploads camera frames to it. The iPhone IPA requires your own Apple signing before installation. These are experimental builds, not App Store or Play Store releases. The browser demo below is the simplest option without native signing or backend setup.

## Try the browser app

**[Open the hosted judge demo](https://stepsense-yolox-v2-preview.stepsense-dahacks.workers.dev/)**. It uses browser-local COCO-SSD and supported live-camera PiP. The historical `yolox-v2-preview` hostname is not the current model identity. See [verified deployment and limits](docs/JUDGES.md).

Requires **Node.js 24+**. From the repository root:

```sh
npm --prefix frontend start
```

Open **http://127.0.0.1:5180/**, complete first-run setup if shown, then select **Start scanning** and allow camera access after model loading. No frontend install, build, account, or backend is needed for the default object detector. It loads bundled **COCO-SSD** through TensorFlow.js/WebAssembly and analyzes frames locally. Initial asset loading and device speed affect startup and responsiveness. The browser baseline is distinct from the experimental native YOLOX candidate. See [experimental model evidence and limitations](docs/v2-testing/README.md).

A phone needs trusted HTTPS, not the laptop's plain HTTP LAN address. See [phone launch](docs/PHONE_LAUNCH.md). The [judge guide](docs/JUDGES.md) separates the hosted preview, local source, optional API paths, and simulated walkthrough.

**Not a navigation or safety device.** Selected object categories and an image-coordinate alert zone do not establish a clear path, distance, collision risk, or comprehensive hazard detection. Empty results are not evidence of safety. Background camera and object alerts are not guaranteed.

## Which runtime am I using?

| Entry point | Actual detection path |
| --- | --- |
| Browser `/` (default) | `frontend/standalone.js` → `local-detector.js`. Bundled COCO-SSD via TensorFlow.js/WASM. Frames stay in the browser for this detector. |
| Browser `/?detector=backend` | Explicit opt-in to `backend-detector.js`. Uploads frames to same-origin `/api/v1/...`, proxied by the local frontend server to Node on port 3001. |
| Browser `/camera.html` | Retained walkthrough with **simulated** detections, or a separately selected **Live camera** mode that uploads frames to the API. Not the default local-model app. |
| Node `backend/server.js` | Fastify API with COCO-SSD, plus optional SegFormer surface model. Separate API runtime from browser-local COCO-SSD and native YOLOX. Model startup can require downloads. |
| Worker `worker/src/index.js` | Cloudflare Workers AI classifier + vision model, Durable Object sessions and frontend assets. Different model, coarse regions, **no bounding boxes**. Not the preferred live-demo inference path. |
| Preview Worker `worker/src/judges-preview.js` | Serves browser assets and optional depth-model assets. **No remote inference API**. Configured separately in `worker/judges-preview.wrangler.toml`. |
| iPhone `samples/ios/MyEyes.xcodeproj` | SwiftUI app, packaged experimental YOLOX-Nano via offline WebKit/WASM, optional LiDAR depth on supported devices. See the [native judge guide](samples/ios/JUDGES.md). |
| Android `samples/android/` | Separate native sample. Its build/device acceptance is not established by the browser or iPhone checks. |

Optional browser depth is a separate experimental subsystem and may download model assets. Local object inference does not mean every optional feature is network-free. See [depth acceptance](docs/DEPTH_ACCEPTANCE.md).

## Optional Node backend flow

```sh
npm --prefix backend ci
npm run demo
```

This starts the frontend on port 5180 and the Node API on port 3001 (or reuses a recognized running Node API). Open **http://127.0.0.1:5180/?detector=backend** to deliberately select it. Running `npm run demo` alone does **not** change the main page's local-detector default. Stop an existing frontend first to avoid a port conflict.

`http://127.0.0.1:3001/health` checks liveness. `/ready` checks detector readiness and may return 503 during loading. [Backend setup](backend/README.md), [API contract](docs/api.md), and [Worker limitations](worker/README.md) describe their respective paths. No account system is implemented.

## Validate locally

```sh
npm --prefix backend ci
npm run check
npm test
# Optional native structural/bundle checks (some checks require macOS/Swift):
npm run test:native
```

`npm test` runs backend, frontend, and Worker suites, stopping on failure. These are automated checks, not proof of camera quality, physical-device PiP, or safe navigation. Native device acceptance is separate.

## Repository map and submission

- `frontend/`: shared browser app, retained walkthrough, local server/proxy, browser tests.
- `backend/`: optional Node detection API and tests. No database/account implementation is implied.
- `worker/`: hosted API and isolated static preview entry points, with tests.
- `samples/`: native iPhone and Android samples.
- `training/`: experimental model training/evaluation artifacts and provenance.
- `docs/`: judge guide, API, model evidence, team notes, and device limitations.
- `tests/e2e/`: [manual cross-app acceptance checklist](tests/e2e/README.md).
- `infra/`: deployment notes. `.github/`: contribution checklist.

Submission deadline: **October 26, 2026 at 9:00 AM PDT / 12:00 PM EDT**. Target Sunday evening submission. CAC considers idea quality, implementation/user experience and coding skill; the old Modern Life theme and 25%-each rubric do not apply. See the [requirements checklist](docs/demo.md), [readiness report](docs/SUBMISSION_READINESS.md), [team workflow](docs/team.md) and [attribution](ATTRIBUTION.md). The required video is **public on YouTube/Vimeo and 1–3 minutes**. Full AI disclosure and significant student contributions are required. No submission or eligibility approval is claimed.

Never commit credentials, personal data, local environment files, or generated Wrangler state. The root ignore excludes `worker/.wrangler/`; removing it from tracking does not erase earlier Git history.
