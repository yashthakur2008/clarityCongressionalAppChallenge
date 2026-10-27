# Congressional Cloudflare release: October 26, 2026

## Release identity

- **Live judges URL:** https://stepsense-yolox-v2-preview.stepsense-dahacks.workers.dev/
- **Repository:** https://github.com/yashthakur2008/clarityCongressionalAppChallenge
- **PR:** [#20](https://github.com/yashthakur2008/clarityCongressionalAppChallenge/pull/20), still open; deployment does not imply merge.
- **Deployed source:** [`df0ebaa9bc235f52d698ff4804d8e377e8a72995`](https://github.com/yashthakur2008/clarityCongressionalAppChallenge/tree/df0ebaa9bc235f52d698ff4804d8e377e8a72995).
- **Cloudflare version:** `97cde6a2-3249-40b2-bfff-19ee700a9ce3`.
- **Deployment:** October 26, approximately 07:01 UTC / 12:01 AM PDT, using Wrangler 4.152.0 and `worker/judges-preview.wrangler.toml`.
- **Previous preview version:** `3d56ca6f-7639-4288-ad46-e2f595bb4eac`, retained as a rollback reference. No rollback performed.
- **Entrant:** Yash, sole entrant, user-confirmed October 26. Historical contributors and AI assistance remain credited separately.

The historical `yolox-v2-preview` hostname is not the browser model identity. This release uses bundled **COCO-SSD / TensorFlow.js / WebAssembly** for default browser-local inference. The experimental native YOLOX detector is a different runtime.

## Deployment scope and authentication

Both GitHub and Cloudflare authentication succeeded using existing credentials. No credentials are included in these artifacts. All submission PRs target the Congressional repository above, not the upstream hackathon repository.

Only the existing isolated `stepsense-yolox-v2-preview` Worker and its static assets were deployed. Its sole binding is `ASSETS`. The separate `stepsense-detection` production inference Worker, its Durable Objects, AI bindings, and databases were not changed. No new hosting account, paid plan or domain was created.

## Public-interface verification

**All 66 deployed public static assets were fetched over HTTPS and matched byte-for-byte against the committed source**, including HTML, JavaScript, CSS, manifest, icons, runtimes, model manifest and all model shards. See the [SHA256 asset manifest](CAC_RELEASE_ASSETS.json).

Isolation probes:

| Request | Observed HTTP status |
| --- | ---: |
| GET `/server.js` | 404 |
| GET `/package.json` | 404 |
| GET `/camera.test.js` | 404 |
| GET `/.assetsignore` | 404 |
| POST `/api/v1/sessions` | 405 |
| GET `/ready` | 404 |

Real Chrome acceptance was rerun against the **public URL**, not only localhost. It used an isolated browser profile, the actual shipped model/runtime and a virtual camera, never the user's physical camera.

| Acceptance behavior | Observed result |
| --- | --- |
| Complete first-run onboarding using real controls | PASS; scanner mounted and camera remained off before Start |
| Start and actual local model execution | PASS; WASM backend ready, media frames advanced and detection ran |
| Stop | PASS; every browser media track ended |
| Offline reload and restart | PASS; app, query-versioned logo and cached model loaded, scanner restarted |
| Cancel while runtime download is held, then release download | PASS; late model completion did not activate camera |
| Explicit restart after cancellation | PASS |
| Failed runtime download, then network restoration and Retry | PASS; failure kept camera off, exposed Retry/Cancel, retry started scanning |
| Navigate to Settings while scanning | PASS; all media tracks ended |
| Happy/offline flow errors and uploads | Zero uncaught page errors and zero POST/frame-upload requests |
| 390px viewport | No horizontal overflow |

Failure-path checks injected download timing/failure, not substitute detector outputs. This is not evidence of physical-scene accuracy, mobile Safari, assistive-technology behavior, native LiDAR or native PiP acceptance.

## Source CI

All three checks passed at deployed source `df0ebaa`:

- [Whole-app regression](https://github.com/yashthakur2008/clarityCongressionalAppChallenge/actions/runs/40283208741): backend 28, frontend 255 and Worker 39 tests passed.
- [Backend safety](https://github.com/yashthakur2008/clarityCongressionalAppChallenge/actions/runs/40283208773): locked install/tests and zero known production dependency advisories.
- [Native tests and Simulator build](https://github.com/yashthakur2008/clarityCongressionalAppChallenge/actions/runs/40283208718): passed and produced the unsigned Simulator artifact.

The additional local native run with the real CI-built bundle passed **96/96, zero skips**. The downloaded artifact came from the earlier sprint build at `c9fc0ad`; exact Git diff verified native source was unchanged through this deployed revision. Simulator success does not provide a signed iPhone distribution or physical-device acceptance.

## Still required before submission

Yash must verify the actual phone demonstration, personal eligibility/district/rights, his own contribution and full AI disclosures, a **public 1–3-minute YouTube/Vimeo video naming him as the sole participant**, the actual application answers and submission receipt. Solo entry is not a claim of sole authorship of inherited work. The working deployment does not itself submit the application.

Official deadline: **October 26, 9:00 AM PDT / 12:00 PM EDT**. See the [readiness dashboard](SUBMISSION_READINESS.md) and [individual submission checklist](demo.md).
