# Download Clarity

**[GitHub mobile releases](https://github.com/yashthakur2008/clarityCongressionalAppChallenge/releases)**

Clarity is an experimental awareness prototype, not a navigation or safety aid. The two native apps currently use different detection paths. A download does not establish real-world accuracy or hardware acceptance.

| Platform | Download | Installation and limitations |
| --- | --- | --- |
| Android 8.0+ | [Clarity-Android-demo.apk](https://github.com/yashthakur2008/clarityCongressionalAppChallenge/releases/latest/download/Clarity-Android-demo.apk) | Installable, debug-signed demonstration build. Requires a configured Clarity inference backend and sends camera frames to that backend. Not an offline equivalent of the iPhone app. |
| iPhone, iOS 16+ | [Clarity-iOS-unsigned.ipa](https://github.com/yashthakur2008/clarityCongressionalAppChallenge/releases/latest/download/Clarity-iOS-unsigned.ipa) | Requires your own Apple signing/provisioning before installation. Tapping this download in Safari does **not** install the app. Local packaged detector; experimental unknown-region fallback. |
| Any supported phone browser | [Open the web demo](https://stepsense-yolox-v2-preview.stepsense-dahacks.workers.dev/) | No APK, Apple signing or native installation required. Browser-local COCO-SSD by default. Not the native iPhone unknown-region detector. |

## Android installation

1. Download `Clarity-Android-demo.apk` from this repository's release page. Compare its SHA-256 with the release's `SHA256SUMS.txt` if verifying the download.
2. On your Android phone, open the APK and temporarily allow installation from that browser or file manager if Android asks. Turn that permission off again afterward. Do not disable Play Protect or other device-wide security protections. If a managed device blocks installation, respect its policy.
3. Configure a trusted Clarity backend. The hosted web-demo address is **not** an inference backend. Follow [backend setup](backend/README.md) and [Android setup](samples/android/README.md). For a controlled USB demo, start the backend on your computer, run `adb reverse tcp:3001 tcp:3001`, and enter `http://127.0.0.1:3001` in the app. Normal remote use should use HTTPS.
4. Grant camera permission when starting scanning. Enable notifications if you want notification alerts and the scanning notification's Stop control. Stop scanning from the app or notification.

**Privacy:** this Android sample uploads camera JPEGs to the configured server. Only use a server you trust, avoid sensitive scenes, and do not expose an unauthenticated development backend to the public internet. The demo build permits cleartext HTTP for local development. It is debuggable and uses a development signing key, not a production distribution identity. It is not a Play Store release. Future builds with another signing key may require uninstalling this demo, which removes its local settings.

Physical-device camera, background-service and alert acceptance remain separate from build verification. Android OS permissions, camera contention, notification settings and manufacturer restrictions can prevent scanning or interruptive alerts. The iPhone's new unknown-region fallback is not included in this Android sample.

## iPhone installation

Apple requires an app to be signed and provisioned for its installation method. GitHub cannot bypass that requirement. The public IPA deliberately contains **no personal development provisioning profile or signing identity**. It is an unsigned device build, not an App Store/TestFlight package or a simulator app.

**Recommended reproducible route, using a Mac:**

1. Download the release source or clone this repository and check out the release tag.
2. Open `samples/ios/MyEyes.xcodeproj` in Xcode and select the **Clarity** scheme.
3. In Signing & Capabilities, choose your own Apple development team. Use a bundle identifier available to your team if necessary. Never share your Apple account password or signing private key.
4. Connect your iPhone, enable Developer Mode if required, select it as the destination, and run. Xcode must create a valid provisioning profile for your device. Free-account signing has Apple-imposed restrictions and expiry.

If you already have a trusted IPA re-signing workflow, you may instead use `Clarity-iOS-unsigned.ipa` with your own signing identity and provisioning. Installation and renewal depend on that workflow and Apple's rules. No third-party signing service is endorsed or required here.

The iPhone detector runs locally using bundled assets. LiDAR depth is optional and requires compatible hardware. Appearance-based unknown detections can mistake shadows or floor patterns for objects and can miss genuine objects. See [the native guide](samples/ios/README.md) and [fallback limitations](docs/UNKNOWN_OBJECT_FALLBACK.md).

## Integrity and source

Each release identifies its source commit and includes `SHA256SUMS.txt`. On macOS/Linux, download the files and run `shasum -a 256 -c SHA256SUMS.txt` from their directory. A matching checksum establishes consistency with the published files, not a security audit or a guarantee of detection accuracy.

Historical contributors, model authors and AI assistance are documented in [ATTRIBUTION.md](ATTRIBUTION.md). Source archives are also available automatically on each GitHub release.
