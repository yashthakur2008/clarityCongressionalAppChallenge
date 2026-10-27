# Live-demo repair, October 27

The user reported missing notifications and slow or absent chair/backpack detection after installation. Build and cat-fixture checks had not established live demo acceptance.

## Confirmed causes and changes

- The physical phone's saved confidence was **0.85**, not the default 0.45. Settings are intentionally preserved across installs. Added a high-threshold warning and explicit **Use recommended 45%** action. Apply is still required. No silent preference overwrite occurred.
- No foreground notification delegate existed. Added banner/list/sound presentation, still subject to iOS permissions, Focus and sound settings. No critical-alert entitlement or silent-mode bypass is claimed.
- Notification authorization was cached after the initial request. It now refreshes when the app becomes active. **Test alert** also posts an explicitly labeled test notification, without pretending an obstacle was detected.
- The scan loop imposed a 333 ms minimum interval. It now uses 100 ms, with single-flight processing, freshness checks, cancellation and recovery delays retained. This permits up to 10 fps, not a measured or guaranteed phone rate.
- Opt-in diagnostic output now includes numeric confidence, detection count and in-zone count. It does not include images or object labels.

## Verification

- Complete native Node/Swift-driven suite: **129 passed, zero failed, zero skipped**, including built-app packaging checks.
- Signed Release iPhone build succeeded. Code signature verified with `codesign --verify --deep --strict`; built-app icon checks passed separately after build.
- Updated app installed successfully on the connected iPhone 15 Pro.
- Automatic diagnostic launch failed because the phone was **locked**. No live camera throughput, user-visible notification, chair or backpack acceptance has been observed for this build.
- Post-install preference inspection still showed **0.85**. The user must apply the recommended threshold before evaluating the effect.

## Actual object probe, not an accuracy claim

Ran production Swift/WKWebView inference on 24 locally cached COCO val2017 photos: the first 12 cached image IDs containing non-crowd chairs and the first 12 containing non-crowd backpacks. These contain 19 annotated chairs and 21 backpacks. Predictions were greedily matched by class at IoU >= 0.50. This small development diagnostic is not a new held-out benchmark or a live camera test.

| Model | Threshold | Chair matches / 19 | Unmatched chair predictions | Backpack matches / 21 | Unmatched backpack predictions |
|---|---:|---:|---:|---:|---:|
| Shipped candidate | 0.85 | 2 | 0 | 0 | 0 |
| Shipped candidate | 0.45 | 6 | 1 | 1 | 2 |
| Shipped candidate | 0.35 | 7 | 2 | 3 | 2 |
| Existing pretrained baseline | 0.45 | 7 | 0 | 1 | 0 |

The threshold explains additional filtering, but **does not solve model quality**. Both models still miss many backpacks. The small comparison did not justify claiming a replacement solved the reported demo failure. Model weights remain unchanged. Raw fixtures, 144 total production inferences across both models, comparison JSON, build/test logs and installation evidence are preserved locally under `~/.jcode/scratch/clarity-demo-repair/`.

## Required phone acceptance

1. Unlock and open Clarity. In Scan settings select **Use recommended 45%**, then **Apply**.
2. Tap **Test alert**. Verify the distinctly labeled test notification and selected in-app outputs. If disabled, enable notifications in iOS Settings and return to retry.
3. Start scanning, hold the camera steady on the real chair and backpack separately, and inspect boxes and checked-frame/timing diagnostics.
4. Real obstacle notifications remain limited to confirmed **Near** proximity, not every recognized object. Background camera/inference and notification delivery require separate physical checks.

These steps remain pending. Do not describe the demo as fixed solely from the passing automated suite.
