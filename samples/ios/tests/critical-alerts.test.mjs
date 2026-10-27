import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const alerts = () => read('../MyEyes/CriticalAlerts.swift');
const player = () => read('../MyEyes/AlertPlayer.swift');
/// Prose may discuss the entitlement we avoid; only executable lines are constrained.
const code = source => source.split('\n').filter(line => !line.trim().startsWith('//')).join('\n');

test('authorization requests only standard, entitlement-free options', () => {
  const source = alerts();
  assert.match(source, /import UserNotifications/);
  assert.match(source, /requestAuthorization\(options: \[\.alert, \.sound, \.badge\]\)/);
  // The special critical-alert entitlement is deliberately never requested.
  const body = code(source);
  assert.doesNotMatch(body, /\.criticalAlert\b/);
  assert.doesNotMatch(body, /criticalAlertSetting/);
  assert.doesNotMatch(body, /defaultCriticalSound/);
  assert.doesNotMatch(body, /critical-alerts/);
  assert.doesNotMatch(body, /try!/);
  assert.doesNotMatch(body, /fatalError/);
});

test('interruption level is time sensitive with a plain active fallback', () => {
  const source = alerts();
  assert.match(source, /interruptionLevel = isTimeSensitiveAuthorized \? \.timeSensitive : \.active/);
  assert.match(source, /timeSensitiveSetting == \.enabled/);
  assert.match(source, /UNMutableNotificationContent\(\)/);
  // Immediate delivery: no trigger object at all.
  assert.match(source, /UNNotificationRequest\(identifier: [^,]+, content: content, trigger: nil\)/);
  assert.match(source, /"Object very close"/);
  // Body must name the detected label.
  assert.match(source, /body = "\\\(label\)/);
});

test('sound is the ordinary default notification sound', () => {
  const source = alerts();
  assert.match(source, /content\.sound = \.default\b/);
});

test('exposes the capability actually achieved', () => {
  const source = alerts();
  assert.match(source, /private\(set\) var isAuthorized/);
  assert.match(source, /private\(set\) var isTimeSensitiveAuthorized/);
  assert.match(source, /enum CriticalAlertLevel/);
  assert.match(source, /case timeSensitive\b/);
  assert.match(source, /case active\b/);
  assert.match(source, /case unauthorized\b/);
  assert.match(source, /var achievedLevel: CriticalAlertLevel/);
  // No code path may ever report a critical level.
  assert.doesNotMatch(source, /case critical\b/);
  // The model surfaces the real level to the UI.
  assert.match(read('../MyEyes/ScanModel.swift'), /var criticalAlertLevel: CriticalAlertLevel \{ alerts\.criticalAlertLevel \}/);
});

test('throttle is three seconds and keyed per label', () => {
  const source = alerts();
  assert.match(source, /static let throttleInterval: TimeInterval = 3/);
  assert.match(source, /lastPosted\[label\]/);
  assert.match(source, /now - previous < Self\.throttleInterval/);
  // A non-monotonic clock must not permanently suppress alerts.
  assert.match(source, /now >= previous/);
  assert.match(source, /guard now\.isFinite else \{ return \}/);
});

test('volume clamp helper never exceeds unity', () => {
  assert.match(alerts(), /static func clampVolume\(_ volume: Float\) -> Float \{\s*min\(max\(volume, 0\), 1\)/);
  const used = player();
  // NEAR alerts play at the clamped floor of 1.0, intermediate keeps the quieter level.
  assert.match(used, /CriticalAlerts\.clampVolume\(/);
  assert.match(used, /isNearBand \? 1\.0 : 0\.65/);
  assert.doesNotMatch(used, /volume = 0\.65$/m);
  // System volume is never touched: that is private API and gets rejected.
  assert.doesNotMatch(used, /setSystemVolume|MPVolumeView|outputVolume\s*=/);
});

test('near band haptics are a sharp warning plus a three pulse burst', () => {
  const source = player();
  assert.match(source, /import CoreHaptics/);
  assert.match(source, /nearHaptic\.notificationOccurred\(\.warning\)/);
  assert.match(source, /static let nearBurstPulses = 3/);
  // Burst must be shorter than the 0.5s NEAR cadence so pulses never overlap the next tick.
  const spacing = source.match(/static let nearBurstSpacing: TimeInterval = ([\d.]+)/);
  assert.ok(spacing, 'near burst spacing constant missing');
  assert.ok(Number(spacing[1]) * 3 < 0.5, 'burst must be shorter than the near cadence');
  assert.match(source, /CHHapticEngine\.capabilitiesForHardware\(\)\.supportsHaptics/);
  assert.match(source, /\.hapticTransient/);
  // Intermediate band keeps the existing single medium impact.
  assert.match(source, /proximityHaptic\.impactOccurred\(\)/);
  assert.match(source, /if isNearBand/);
});

test('near proximity events notify through the notification channel', () => {
  const source = player();
  assert.match(source, /criticalAlerts\.postNearAlert\(label:/);
  // The near band is latched from the routed target, not re-derived inside the cadence.
  assert.match(source, /private var isNearBand = false/);
  assert.match(source, /isNearBand = target\.freshProximityBand\(at: now\) == \.near/);
  assert.match(source, /private var nearLabel/);
  // Losing the target must clear the latch so a stale label cannot keep notifying.
  const stop = source.slice(source.indexOf('func stopProximity()'), source.indexOf('private func emitProximity'));
  assert.match(stop, /isNearBand = false/);
  assert.match(stop, /nearLabel = nil/);
});

test('Info.plist declares the notification usage description', () => {
  assert.match(read('../MyEyes/Info.plist'), /NSUserNotificationsUsageDescription/);
});

test('CriticalAlerts is registered in the Xcode target', () => {
  const project = read('../MyEyes.xcodeproj/project.pbxproj');
  assert.match(project, /CriticalAlerts\.swift in Sources/);
  assert.match(project, /path = CriticalAlerts\.swift/);
});

test('foreground notifications explicitly present banners and sound', () => {
  const source = alerts();
  assert.match(source, /UNUserNotificationCenterDelegate/);
  assert.match(source, /center\?\.delegate = self/);
  assert.match(source, /nonisolated func userNotificationCenter/);
  assert.match(source, /willPresent notification: UNNotification/);
  assert.match(source, /completionHandler\(\[\.banner, \.list, \.sound\]\)/);
});

test('returning from Settings refreshes authorization without another permission prompt', () => {
  const source = alerts();
  assert.match(source, /UIApplication\.didBecomeActiveNotification/);
  assert.match(source, /#selector\(refreshAuthorization\)/);
  const refresh = source.slice(source.indexOf('@objc private func refreshAuthorization'), source.indexOf('/// At most one alert'));
  assert.match(refresh, /notificationSettings\(\)/);
  assert.doesNotMatch(refresh, /requestAuthorization\(options:/);
  assert.match(source, /case \.authorized, \.provisional, \.ephemeral:/);
  assert.match(source, /isAuthorized = false/);
});

test('test alerts use honest notification wording without changing generic detection delivery', () => {
  assert.match(player(), /func testAlert\(_ modes: \[AlertMode\], message: String\)/);
  assert.match(player(), /if !modes\.isEmpty \{ criticalAlerts\.postTestAlert\(\) \}/);
  assert.match(alerts(), /Clarity test notification/);
  assert.match(alerts(), /not an obstacle warning/);
});

test('notification service executes permission transitions, delegate, throttle and test delivery with framework doubles', { skip: process.platform !== 'darwin' }, async () => {
  const { execFileSync } = await import('node:child_process');
  const { mkdirSync, mkdtempSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { homedir } = await import('node:os');
  const { fileURLToPath } = await import('node:url');
  const root = process.env.JCODE_SCRATCH_DIR || join(homedir(), '.jcode', 'scratch');
  mkdirSync(root, { recursive: true });
  const dir = mkdtempSync(join(root, 'notification-tests-'));
  // Execute production logic with OS boundaries doubled. Actual delegate registration and
  // UIApplication notification wiring are separately source-checked and Release-compiled.
  const source = alerts().replace('import UserNotifications', '').replace('import UIKit', '')
    .replace(/        NotificationCenter.default.addObserver\(self,[\s\S]*?object: nil\)\n/, '')
    .replace('@objc private func refreshAuthorization', 'func refreshAuthorization');
  writeFileSync(join(dir, 'CriticalAlerts.swift'), source);
  execFileSync('swiftc', ['-parse-as-library', join(dir, 'CriticalAlerts.swift'), fileURLToPath(new URL('CriticalAlertsTests.swift', import.meta.url)), '-o', join(dir, 'tests')], { timeout: 60000 });
  assert.match(execFileSync(join(dir, 'tests'), { encoding: 'utf8', timeout: 10000 }), /PASS notification service/);
});
