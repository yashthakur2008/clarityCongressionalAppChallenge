# Native iPhone guide for judges

**Current native source:** [Congressional App Challenge repository](https://github.com/yashthakur2008/clarityCongressionalAppChallenge/tree/main/samples/ios). The app is **Clarity**, with the experimental YOLOX-Nano candidate, ONNX Runtime Web **1.20.1** and a **0.45** default confidence threshold. See [detection coverage](../../docs/DETECTION_COVERAGE_ACCEPTANCE.md), [model-loading acceptance](../../docs/MODEL_LOADING_ACCEPTANCE.md) and [visual proximity limits](../../docs/VISUAL_PROXIMITY_ACCEPTANCE.md). October 17 build, deployment and device observations below are historical, not acceptance of the current submission revision.

## What you can access now

| Option | Access and limits |
| --- | --- |
| Public source | [Current submission native source](https://github.com/yashthakur2008/clarityCongressionalAppChallenge/tree/main/samples/ios). Open `MyEyes.xcodeproj`, scheme **Clarity**. The earlier [upstream audit at `6f811f2`](https://github.com/AdityaDave2008/DAHacks26-AD-BW-YT-NQ-DK/tree/6f811f2ed7d964d07b1b0281ae49f054321c8088/samples/ios) is historical evidence, not the submission revision. |
| Browser demo | [Open the historical HTTPS browser preview](https://stepsense-yolox-v2-preview.stepsense-dahacks.workers.dev/). This is not the selected final CAC release; current release parity and physical acceptance remain unverified. See [readiness](../../docs/SUBMISSION_READINESS.md). This is a separate browser implementation, not the native app streamed to the web. Camera access requires browser permission. Browser depth is not iPhone LiDAR, and native PiP behavior does not transfer to the browser. |
| Simulator build artifact | Historical upstream [passing GitHub Actions run for `3fb11da`](https://github.com/AdityaDave2008/DAHacks26-AD-BW-YT-NQ-DK/actions/runs/39018976226) recorded **Clarity-iOS-Simulator** (about 7.6 MB, recorded expiry January 15, 2027). Availability has not been rechecked for this submission. GitHub may require sign-in to download artifacts. It is an unsigned simulator build for a compatible Mac/Xcode, **not an installable iPhone IPA**, current submission build or physical-camera demonstration. |
| Native physical demonstration | Ask the team to demonstrate its already-installed app on its own iPhone. Identify the actual app/version before the demo: current source displays **Clarity**, while older builds used **Clarity V2 Test** or the separate StepSense baseline. No new phone installation or settings changes were performed for this audit. |
| Video fallback | A short team-recorded walkthrough is a useful backup, but no public native demo recording was verified in this audit. Record only with consent and avoid capturing bystanders or private material. A video illustrates the observed run, not general safety or accuracy. |

**Source availability is not installable distribution.** There is no verified public IPA, App Store listing, or TestFlight invitation in this guide. An unsigned build cannot simply be installed on a judge's phone. Signed device distribution requires the appropriate Apple provisioning and permissions. Do not change the team's signing settings, overwrite its installed app, or reset its preferences to make a demo work.

## Which app is in the repository?

In current source, the native directory is `samples/ios/MyEyes/`, project `samples/ios/MyEyes.xcodeproj`, target/scheme/product and display name **Clarity**, and bundle identifier `com.dahacks.clarity.v2testing`. **Clarity V2 Test** is a historical display name, not the current `Info.plist` value.

It packages the experimental fine-tuned **YOLOX-Nano ONNX candidate** and **ONNX Runtime Web 1.20.1**. The candidate hash is `516617114420ce3c2bac545869ee91bac8ff7a63e148a73afdb12f126433fab4`. See [asset manifest](MyEyes/OfflineDetector/ASSETS.json), [provenance](MyEyes/OfflineDetector/PROVENANCE.md), and [candidate verification and limitations](../../docs/v2-testing/README.md).

**Historical comparison from October 17:** the original checkout at `fa44c550400060a80470c89bfd3a3f0deddee8b3` contained the older COCO-SSD/TensorFlow.js native implementation under the same MyEyes project path, with bundle `com.dahacks.myeyes.sample`. Its historical StepSense Xcode workspace directory contained only user-interface state, not a `project.pbxproj`. That workspace is not a missing app that needs to be copied into main. Both revisions audited then had 43 tracked native files. Those file counts do not describe current source. The differing model/runtime assets represented two detector versions, not omitted files.

## Reproduce a compilation check

Requirements: macOS, Xcode with the iPhoneOS SDK, and Node.js **24 or newer** for the native regression suite. The project declares iOS 16 as the minimum deployment target. No backend, Swift package resolution, or model download is needed for the native build.

From the repository root:

```sh
xcodebuild -list -project samples/ios/MyEyes.xcodeproj
xcodebuild -project samples/ios/MyEyes.xcodeproj -scheme Clarity \
  -configuration Debug -destination 'generic/platform=iOS' \
  -derivedDataPath "${JCODE_SCRATCH_DIR:-$HOME/Library/Caches}/clarity-unsigned" \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO build
node --test samples/ios/tests/*.test.mjs
```

These command-line signing overrides do not edit project signing settings. Build output is outside the checkout. Do not install the resulting unsigned `.app` or present it as a distributable IPA. A simulator or unsigned compilation does not establish camera, hardware LiDAR, haptic or background behavior.

## Historical audit evidence, October 17, 2026 UTC

- Anonymous GitHub access confirmed the repository is public. `git ls-remote` confirmed main at `6f811f2ed7d964d07b1b0281ae49f054321c8088` during the audit.
- `xcodebuild -list` reported the **Clarity** target and scheme, with Debug and Release configurations.
- Archived tracked source from main built successfully for generic iOS, Debug, with signing disabled, using Xcode **27.1 (27A9275)**. The separately archived original `fa44c55` native source also built successfully with identical unsigned options. Neither live checkout nor any phone was used as a build destination.
- Main native suite: **56 passed, 0 failed, 0 skipped**. This includes packaged model/runtime SHA-256 and byte-size checks, policy parity and native regression tests. This run is not a fresh WKWebView image-inference or physical-camera acceptance test.
- Both builds emitted only the observed AppIntents metadata-extraction warning about the absent AppIntents framework dependency. Both ended with `BUILD SUCCEEDED`.
- The public browser entry returned its page and `/ready` returned `{"ready":true,"modelState":"ready"}`. These HTTP checks alone do not prove live browser camera or detection behavior.
- No signing changes, installation, permission reset, app/settings overwrite, or physical acceptance run was performed. The original checkout remained clean.

## Historical integrated upstream follow-up, October 17 at 08:31 UTC

The native source merged from upstream `7be09a5`, including its explicit `ScanPreferences` initializer and depth-preference regression assertions, passed a fresh **unsigned generic-iOS Debug build** and **56/56 native tests** on this Mac using Node.js 24. Build inputs were copied from tracked working-tree files to an external snapshot, fingerprinted, and confirmed unchanged after the build. No original checkout, signing setting, installed app or phone was modified. This is fresh compilation/regression evidence, not physical-device acceptance. The initial revision results above remain historical rather than being relabeled as this run.

[Current submission native source](https://github.com/yashthakur2008/clarityCongressionalAppChallenge/tree/main/samples/ios) may advance after these checks. The browser uses a separate COCO-SSD runtime. Native YOLOX candidate weights retain the hash above, but the later default threshold and class coverage changed. Do not apply the historical operating point or test counts to the current submission.

## Suggested on-site demonstration

1. State which installed app is being shown. In a stationary, controlled scene, start scanning and show camera preview, detector state and supported objects. Do not use the prototype to navigate traffic or hazards.
2. Show a known object and explain confirmation, cooldown, sparse results and possible missed detections. The candidate mAP is worse than baseline, so do not claim improved accuracy. The current default threshold is **0.45** through `ScanPreferences.candidateConfidenceDefault`, shared by the preferences property and initializer. Existing saved/user settings may differ. The previous approximately **0.7875** default is historical. JPEG preprocessing equivalence is not established.
3. If supported and already configured, show optional LiDAR readouts. They are approximate axial surface depth, not nearest-object clearance or collision prediction. Reference-distance accuracy and object association still require physical validation.
4. Demonstrate PiP only if it actually works on that device. Background inference and alerts are not guaranteed. Old/failed results must not be described as a clear path.
5. Stop scanning. Use the browser URL or an explicitly labeled recording if the device demonstration is unavailable.

The prototype can miss hazards. No detection result, empty scene, successful build, or demonstration proves that travel is safe.
