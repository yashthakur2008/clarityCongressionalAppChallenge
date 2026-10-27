# Unknown-object appearance fallback

Approved by the user on October 26 (local time), 2026. Scope: the native iPhone app's existing offline camera pipeline. This is a color-agnostic appearance heuristic, not a newly trained recognition model or a guarantee of general obstacle detection.

## Behavior contract

- Estimate dominant appearance inside the lower image zone. Do not assume green objects, a specific floor hue, or that any minority color must be an object.
- Propose compact, sufficiently contrasting regions; reject broad surface transitions, edge-connected regions, thin seams and unsupported/ambiguous floor appearance where possible.
- Exclude proposals substantially covered by existing named detections. Preserve all existing named-object behavior.
- Require three consecutive spatially and size-consistent fresh observations before exposing a proposal. Reset on missing evidence, stale frames, settings changes, failures and scan restart. Unknown evidence is limited to 750 ms capture age.
- Display **Possible unknown object** and **Appearance contrast · unclassified**, without a model confidence percentage or inferred distance.
- The existing confirmation/cooldown policy gates a generic warning. No unknown region is promoted to a measured Near/Far object using the depth of the floor behind it.
- Ordinary local notification text must describe a possible unclassified region, never a confirmed close collision hazard. Honor output preferences and system permission.
- Process existing camera pixels locally in the bundled runtime, with bounded sampling and no new network dependency.

## Limitations to retain

Appearance alone cannot reliably distinguish a flat object from a painted marking, compact shadow, stain, small rug or terrain patch. Same-colored, transparent, very small, edge-touching or poorly lit objects may be missed. Broad-transition rejection intentionally sacrifices coverage. Neither an empty result nor a rejected candidate means the floor is clear. Physical iPhone tests are required in addition to synthetic image and runtime tests.

## Acceptance checks

1. Varied floor colors and object colors, including dark/light objects, not just the provided green-item example.
2. Uniform floors, lighting gradients, seams, stripes and broad color/terrain changes do not create proposals in the covered test fixtures.
3. Known-region overlap suppression and multiple-object cap.
4. Temporal confirmation, missing-frame reset, monotonic time, spatial/size changes and stale-frame handling.
5. Actual production WebKit pipeline with the new bundled script, preserved existing model smoke checks, native unknown rendering/routing tests and signed iPhone compilation.
6. Install and request an actual floor/object/terrain comparison on the phone. Report physical acceptance as pending unless observed.

## Observed verification

- Native regression suite: 151 passed, zero failed/skipped.
- Production Swift/WKWebView/ONNX pipeline: four synthetic palettes (red on tan, blue on gray, dark on light, light on dark) exposed an unknown region only after three observations and emitted the uncertainty-preserving warning after the fourth. Uniform-floor and broad split-surface negative fixtures produced no unknown regions. This validates integration, not real-world accuracy.
- Existing real-cat inference smoke remained green, including 120 post-recovery inferences, missing/corrupt model handling, cancellation, timeout and blocked remote fetch.
- Signed Release build passed; all 12 bundled asset hashes matched both the manifest and source; code signature verification passed.
- Installed and launched successfully on the connected iPhone 15 Pro. Actual unknown-object performance on the user's floor has not yet been observed.

The new fallback is independent of the named-class confidence slider. It uses no green-specific threshold. The classifier weights remain unchanged. Public video playback was not verified; the supplied URL is a Drive folder.

Reproduce the full-runtime appearance check on macOS:

```sh
swiftc -parse-as-library samples/ios/MyEyes/APIClient.swift \
  samples/ios/MyEyes/DepthEstimate.swift samples/ios/MyEyes/OfflineDetector.swift \
  samples/ios/MyEyes/DetectorRecovery.swift samples/ios/tests/UnknownInferenceSmoke.swift \
  -o "$JCODE_SCRATCH_DIR/unknown-inference-smoke"
"$JCODE_SCRATCH_DIR/unknown-inference-smoke" "$PWD/samples/ios/MyEyes/OfflineDetector"
```
