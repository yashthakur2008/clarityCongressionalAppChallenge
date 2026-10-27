# Clarity: native presentation and pitch

## One-sentence pitch

**Clarity turns selected objects detected by your iPhone’s camera into visual, spoken, and vibration cues, with processing kept on-device.**

Clarity is an experimental awareness tool, not a replacement for mobility aids. It can miss objects. No detections, a green indicator, or a depth estimate establishes that a path is safe.

## A clear 45-second demonstration

1. **Purpose:** “Clarity presents selected objects in different ways, so users can choose visual, spoken, or vibration feedback.”
2. **Action:** Show the scanner, explain that the camera is initially off, and tap **Start scanning**. Describe an actual observed result, not a rehearsed detection that did not occur.
3. **Choice:** Open **Settings** and show the alert options. Explain only the features present in the build being demonstrated.
4. **Privacy:** “The native app bundles its detection model and processes camera frames on this iPhone.”
5. **Boundary:** “This is a prototype. It can miss objects and is not a navigation or safety aid.”

Do not claim user validation, reliable background analysis, accurate physical distance on every device, or sole authorship unless separately established. The native model differs from the web demo's COCO-SSD model. Keep inherited-work and AI-assistance disclosures accurate.

## Presentation decisions

- Use native navigation and a toolbar Settings action rather than a custom Home/Settings bar.
- Make the camera, current status, and Start/Stop the main sequence.
- Retain Clarity's coral eye artwork and accent while adopting semantic system surfaces and text colors for light/dark appearance.
- Put everyday alert choices before experimental model information in Settings.
- Keep essential privacy and safety information visible. Put full proximity explanations and diagnostics behind disclosure controls rather than removing them.
- Preserve the actual capture, detector, alert, cancellation, preference-application, and Picture in Picture behavior.

## Primary-source design references

Reviewed October 26, 2026:

- [Apple Human Interface Guidelines: Writing](https://developer.apple.com/design/human-interface-guidelines/writing): put important information first, use plain language, keep labels action-oriented, and explain empty/error states.
- [Apple Human Interface Guidelines: Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons): use familiar system controls, restrained prominent actions, and hit regions of at least 44 × 44 points.
- [Apple Human Interface Guidelines: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility): support Dynamic Type, prefer adaptive system colors, check contrast in both appearances, and communicate through more than color alone.

These references inform design decisions. They do not establish Apple endorsement or certify accessibility compliance.

## Inspect the real app on a Mac

No phone is required to review navigation and layout:

1. Open `samples/ios/MyEyes.xcodeproj` in Xcode.
2. Select the **Clarity** scheme and an installed **iPhone Simulator** destination, not “Any iOS Device.”
3. Choose **Product → Run**. This launches the actual SwiftUI app in Simulator.
4. Review the scanner and Settings. Use Simulator's appearance and text-size controls to inspect dark/light and larger text.

### Verified in Simulator

Checked October 26, 2026 on an isolated iPhone 17 simulator (iOS 27.0), using the real app build:

| Check | Result |
| --- | --- |
| Native suite | 101 passed, 0 failed, 1 skipped (skip requires a compiled bundle) |
| Scanner and Settings, standard text | Settings opens and closes, primary action reachable, no clipping |
| Largest accessibility text | Start scanning wraps in a rounded rectangle, alert labels stack above their switches |
| Light and dark appearance | System surfaces adapt; the coral accent remains |

Screenshots for review: `~/Desktop/clarity-app-preview`.

Simulator does not establish physical camera detection quality, LiDAR measurements, haptics, or background-camera behavior. An unavailable camera is a real simulator limitation, not a reason to insert unlabelled fake detections. Screen captures from Simulator show the native interface, not a browser mockup.

### Unsigned Simulator build

From the repository root:

```sh
xcodebuild -project samples/ios/MyEyes.xcodeproj -scheme Clarity \
  -configuration Debug -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath "$HOME/Library/Caches/clarity-preview" \
  CODE_SIGNING_ALLOWED=NO build
```

This build command does not install on a phone, change signing accounts, or publish a release. Do not overwrite an existing physical-device installation just to inspect the interface.
