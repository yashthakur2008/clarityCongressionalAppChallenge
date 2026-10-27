# Clarity: native Android sample

This separate Android app captures small rear-camera images, sends them to the existing Clarity backend, and plays selected alerts. A user starts the camera foreground service from the visible app, then can switch to Instagram or another app while the service continues its capture/request loop. A persistent scanning notification has a **Stop** action.

The app uses **real backend COCO-SSD inference**. It contains no fake detector, embedded ML model, recording, account system, or screen scraping. It is independent of the web and iOS samples. The dark/teal screen shows the last analyzed image, normalized detection boxes, the backend's zone, request timing, and Start/Stop controls.

**Fastest physical-phone setup:** connect an Android phone over USB with USB debugging enabled, run `adb reverse tcp:3001 tcp:3001`, and enter `http://127.0.0.1:3001` in the app. This reuses the already-running laptop backend without changing its loopback bind or starting another server.

## Download and sideload the demo

See the repository's [download instructions](../../DOWNLOADS.md) for the GitHub asset named **Clarity-Android-demo.apk**. This is a **debug-signed, debuggable experimental demo**, not a production-signed or Play Store release. It requires Android 8.0 / API 26 or newer and a rear camera. It has no native ABI restriction because it contains no native libraries.

Download the APK on the phone and open it, then allow installation from that browser or file manager when Android asks. Alternatively, with USB debugging enabled:

```sh
adb install -r Clarity-Android-demo.apk
```

An existing `dev.myeyes.sample` installation signed with another key cannot be updated with this APK. Uninstalling it first removes its app settings. Future production signing also requires an explicit migration or uninstall. Do not treat the Android Debug certificate as a production publisher identity.

**Installation is not a complete setup:** the Android app uploads rear-camera JPEGs to a separately running Clarity backend for inference. It does not perform offline inference and does not have native iOS feature parity. Configure a trusted HTTPS backend, or use the controlled USB/local HTTP setup below. The debug build permits cleartext HTTP, so do not send camera frames across an untrusted network. Camera and notification permissions are requested in the app. Full-screen alerts remain restricted by Android and user settings.

## Open and run

1. In Android Studio, choose **Open** and select this `samples/android` folder. Allow Gradle sync and install Android SDK Platform 36 if prompted.
2. Set the project's Gradle JDK to **JDK 17 or 21** in Android Studio settings. The project includes the official Gradle 8.13 wrapper, so a global Gradle installation is unnecessary.
3. Choose an Android device with a rear camera, running **Android 8.0 / API 26 or later**. A physical Android 14+ device is the important acceptance target for modern foreground-service restrictions.
4. Ensure the existing backend is running and ready. From the repository root, inspect it without starting a duplicate server:

   ```sh
   curl http://127.0.0.1:3001/ready
   ```

   If you need to start it on a machine with no backend process, follow [the backend setup](../../backend/README.md). Wait for `"ready": true` before the demo. Provider-hosted model weights need network access when the backend starts.

5. Configure the app's **Backend server address**:

   | Setup | Address in the app |
   | --- | --- |
   | Android Studio emulator | `http://10.0.2.2:3001` |
   | USB-connected physical phone after the command below | `http://127.0.0.1:3001` |
   | Existing HTTPS backend | Its HTTPS origin, without `/api/v1` |
   | Phone and laptop on Wi-Fi | Laptop LAN address and API port; the backend must already listen on that interface and the firewall must permit it |

   For a USB phone with USB debugging enabled, run the SDK's `adb`:

   ```sh
   adb reverse tcp:3001 tcp:3001
   ```

   This lets the phone use the laptop's existing loopback backend without changing its bind address. Android native HTTP requests do not require a browser CORS origin entry.

6. Press **Run** in Android Studio. Select sound/vibration, try **Test selected alerts**, then tap **Start scanning** and grant Camera. Allow notifications to keep the notification's Stop action visible.
7. Wait until the status says **Scanning**, then switch to Instagram's viewing screen. Keep the rear camera facing a controlled scene with a supported object such as a backpack or chair. Return to Clarity to inspect the analyzed frames and measured timing.
8. Stop from the notification or the app. Swiping the Clarity task away also stops the service. A restart always requires another Start tap from the app.

The Debug build permits plain HTTP for a local demo. The Release build does not opt into cleartext traffic; use HTTPS for it. No backend credentials belong in the app URL. This sample does not install or publish anything externally.

## Command-line build

With the JDK and Android SDK already configured:

```sh
cd samples/android
./gradlew :app:assembleDebug
./gradlew :app:installDebug
```

On Windows use `gradlew.bat`. The APK is written to `app/build/outputs/apk/debug/app-debug.apk`. Android Studio generates machine-specific `local.properties`; it is intentionally ignored. The first build downloads the pinned Android Gradle plugin and Gradle distribution.

Versions: Android Gradle plugin **8.13.2**, Gradle **8.13**, compile/target SDK **36**, Java source **17**. There are no third-party runtime dependencies. See Google's [AGP compatibility table](https://developer.android.com/build/releases/agp-8-13-0-release-notes).

## What runs after switching apps

- `MainActivity` requests Camera and starts a camera foreground service only from a visible, resumed screen. It does not auto-start on boot, from background callbacks, or after process death.
- `ScannerService` immediately promotes itself with a `camera` foreground-service type and notification. Both `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_CAMERA` are declared, alongside runtime Camera permission. Android documents this type as supporting continued camera access from the background. See [foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types#camera).
- Camera2 captures a JPEG at the largest available size whose two dimensions are at most **640**. JPEG quality is 70; frames over **1 MiB** are rejected locally. A phone that offers no such JPEG size shows a camera error rather than uploading oversized images.
- One camera capture/upload/inference cycle runs at a time. The next fresh capture begins no sooner than **333 ms** after the previous capture started, targeting up to roughly **3 frames/second** when the phone, JPEG pipeline, network, and backend permit it. This is a cap, not a measured performance claim.
- The app waits for `/ready`, reads `/api/v1/model`, creates a session, and submits raw JPEG bytes with an increasing `X-Frame-Sequence`. Server confirmation/cooldown decides `alert.triggered`; sound/vibration are delivered locally. A result older than **2500 ms** cannot trigger an alert.
- Stop invalidates the run token before cancelling HTTP/camera work. Late responses cannot play an alert or restart capture. Session deletion is best effort; the backend also expires abandoned sessions. Network/model failures clear boxes and show **Analysis unavailable**, then retry with a fresh frame. An expired session is recreated.
- The Activity binds only to observe state. Leaving it does not stop a started service. The service uses `START_NOT_STICKY`; it does not attempt a prohibited background restart. Process termination, camera revocation, task removal, and device policies can still end a session.

There is no floating preview in this core sample. It does not need overlay permission, access to Instagram, microphone permission, screen recording, or a fake call. Opening another app's camera can take the camera away; this sample stops and asks the user to restart. Screen-off operation and manufacturer battery-management behavior are unverified.

Notification permission is optional at the OS level. If it is denied, Android may omit the notification from the drawer even though its active-service indicator remains. The app explains this and keeps its own Stop control. [Android's notification-permission documentation](https://developer.android.com/develop/ui/views/notifications/notification-permission) describes that behavior. Device volume, Do Not Disturb, haptic preferences, and hardware affect alerts; the Test button makes those checks explicit. The app does not record audio or attempt to take audio focus from Reels.

## Breaking through the foreground app

When the backend confirms a near object, the app tries to interrupt whatever the user is doing. Android permits this more directly than iOS does.

- `ProximityAlerts` creates a second notification channel, **Proximity alerts**, at `NotificationManager.IMPORTANCE_HIGH`, separate from the low-importance scanning channel. Its sound uses `AudioAttributes.USAGE_ALARM`.
- The channel calls `setBypassDnd(true)`. That request **only takes effect if the user grants this app a Do Not Disturb override** in system settings. Without the override the channel still works and simply respects DND. The call is wrapped so a refusal degrades instead of crashing.
- The near-object notification uses `setFullScreenIntent(pendingIntent, true)` with `Notification.CATEGORY_ALARM` and `PRIORITY_HIGH`, which can launch `AlertActivity` over the foreground app. `USE_FULL_SCREEN_INTENT` is declared in the manifest.
- On **Android 14+ (API 34+) `USE_FULL_SCREEN_INTENT` is restricted** and is not granted to a general-purpose app by default. The code asks `NotificationManager.canUseFullScreenIntent()` and, when it returns false, posts a heads-up notification only and plays the local tone/vibration instead. **The full-screen takeover is not guaranteed on API 34+.** See [the time-sensitive notification guidance](https://developer.android.com/training/notify-user/time-sensitive).
- `AlertActivity` fills the screen with **Watch out**, the highest-confidence detected label, the alert detail, and a **Dismiss** button. It calls `setShowWhenLocked(true)` and `setTurnScreenOn(true)` (with pre-27 window-flag fallbacks, since `minSdk` is 26), vibrates a short sharp `0/160/70/160` waveform with `VibrationAttributes.USAGE_ALARM` on API 33+, and plays the default alarm tone through `AudioAttributes.USAGE_ALARM` at full player volume. The alarm stream stays audible when the ringer is silenced, subject to the device's alarm volume. It auto-dismisses after 6 seconds and stops all feedback on pause or destroy.
- Wording (**Watch out**, **Dismiss**) is kept in step with the iOS app so both products tell the same story. Android holds the canonical strings in `ProximityAlerts`.
- Notification posting is still gated on `POST_NOTIFICATIONS`. If the user denies notifications, `raise()` returns false and the local tone/vibration path carries the alert.

## Physical-phone acceptance pass

These checks remain to be run on a real phone:

1. Grant and deny Camera and Notifications; confirm usable error states and that the service starts only after an explicit visible Start action.
2. Check `/ready`, start a session, and confirm real frames, boxes, and timings appear. Place a supported object in the shared zone for two observations and verify each selected alert mode.
3. Open Instagram Reels while retaining camera direction toward that scene. Check that the scanning notification remains, the backend continues receiving requests, and alerts occur. Measure full capture/request/alert latency; do not infer it from the older backend-only measurements.
4. Stop from the notification during an upload. Confirm camera indicators and network activity cease and no late alert plays. Repeat quick Stop/Start, rotation, app switching, task removal, and a second app requesting the camera.
5. Disconnect and reconnect the backend; verify unavailable state and recovery. Try sound-only, vibration-only, and visual-only (both off), including the device's actual volume and haptic settings.
6. With Instagram Reels in the foreground, trigger a near object and confirm the full-screen **Watch out** screen appears over it, shows the detected label, vibrates, sounds on the alarm stream with the ringer silenced, and auto-dismisses. Repeat with the device locked. On an Android 14+ device, check `canUseFullScreenIntent()`: if it is false, confirm the heads-up fallback plus local tone/vibration still alerts the user. Also test with and without a Do Not Disturb override granted.

General object detection does not identify every walking hazard. This backend has no dedicated curb, stair, pothole, cone, or construction-barrier class. Image-space boxes do not establish physical distance, ground contact, or a clear path. Demo this as an experimental awareness prototype in a controlled scene.

## Verification performed here

On 2026-10-26, this project was compiled using an isolated **Corretto JDK 17.0.21**, Android SDK Platform **36**, Gradle **8.13**, and Android Gradle Plugin **8.13.2**. The actual compiler exposed two invalid subclass multi-catches in `ProximityAlerts`, which were corrected. Android lint exposed an API-27-only theme attribute in the API-26 base resources, which was removed because its false value was redundant.

Verification commands:

```sh
./gradlew --no-daemon :app:assembleDebug :app:assembleRelease :app:lintDebug :app:lintRelease
node tests/alerts.test.mjs
apksigner verify --verbose --print-certs app/build/outputs/apk/debug/app-debug.apk
aapt dump badging app/build/outputs/apk/debug/app-debug.apk
adb devices -l
```

The debug APK is signed with an **Android Debug** RSA-2048 certificate and verifies with APK signature scheme v2. Manifest inspection confirms package `dev.myeyes.sample`, version `0.1.0` / code `1`, minimum SDK 26, target SDK 36, camera foreground-service permissions, and only the launcher activity exported. Debug allows cleartext traffic. Release disables it.

`assembleRelease` produces `app/build/outputs/apk/release/app-release-unsigned.apk`. **That artifact is unsigned and cannot be installed as-is.** A durable, privately managed release signing key is required before it can become a production download. No signing secrets are committed, and the runtime dependency reports for debug and release contain no third-party libraries. A source/build-config scan for common credential patterns found none, and APK ZIP inspection found only DEX, manifest, resources, and Android build metadata, not keys or configuration secrets. These checks are not a comprehensive security audit.

Both assemble tasks and both lint tasks pass. Each lint report contains **0 errors and 13 warnings**, including platform ExifInterface, backup rules, localization, and draw allocations. These warnings were not suppressed.

The 53 source-contract checks pass, including XML parsing. They are static contracts, not runtime tests. `adb devices -l` returned no devices. **Installation, camera capture, backend communication, background scanning, real alert latency, full-screen takeover, sound, and vibration remain unverified on hardware.** Use the physical-phone acceptance checklist above before relying on the demo. This is not a validated safety or navigation aid.

The wrapper distribution checksum is pinned and the JAR retains its official checksum.

The wrapper JAR was downloaded from Gradle's official `v8.13.0` source tag and matches the [published checksum](https://gradle.org/release-checksums/):

```text
81a82aaea5abcc8ff68b3dfcb58b3c3c429378efd98e7433460610fecd7ae45f
```

The Gradle distribution checksum is pinned in `gradle-wrapper.properties`. Wrapper source copyright/license headers remain intact; the JAR's [Apache license](gradle/wrapper/LICENSE) is included. Model and backend attribution remain in the repository's [attribution file](../../ATTRIBUTION.md).
