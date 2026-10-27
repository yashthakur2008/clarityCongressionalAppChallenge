// Source contracts only, not substitutes for device UI or snapshot tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = name => readFileSync(new URL(`../MyEyes/${name}`, import.meta.url), 'utf8');
const ui = read('ScannerView.swift');
const app = read('MyEyesApp.swift');
const content = ui.slice(ui.indexOf('private var scannerContent:'), ui.indexOf('private var scannerActions:'));

test('semantic surfaces support system appearance and retain coral identity', () => {
  assert.match(app, /senseBackground = Color\(uiColor: \.systemGroupedBackground\)/);
  assert.match(app, /senseTeal = Color\(red: 243 \/ 255, green: 139 \/ 255, blue: 104 \/ 255\)/);
  assert.doesNotMatch(app + ui, /preferredColorScheme\(\.dark\)/);
  assert.doesNotMatch(ui, /foregroundStyle\(\.white\.opacity/);
});

test('native toolbar Settings replaces custom bottom navigation', () => {
  assert.match(ui, /Image\("ClarityLogo"\)/);
  assert.match(ui, /NavigationStack/);
  assert.match(ui, /ToolbarItem\(placement: \.navigationBarTrailing\)/);
  assert.match(ui, /Button \{ showingSettings = true \}/);
  assert.match(ui, /sheet\(isPresented: \$showingSettings\) \{ SettingsView\(model: model\) \}/);
  assert.doesNotMatch(ui, /bottomNavigation|Label\("Home"|WKWebView/);
});

test('camera remains native and floating window preserves its source anchor and honest limits', () => {
  assert.match(ui, /CameraPreview\(session: model.camera.session\)/);
  assert.match(ui, /model.startPictureInPicture\(\)/);
  assert.match(ui, /PiPSourceAnchor\(controller: model.pip\)/);
  assert.match(ui, /Offline analysis may pause in the background/);
  assert.doesNotMatch(ui, /Keep scanning while you use other apps/);
});

test('scalable actions and existing native settings bindings remain intact', () => {
  assert.match(ui, /font\(\.body.weight\(\.semibold\)\)/);
  assert.match(ui, /minHeight: 44/);
  assert.match(ui, /ViewThatFits\(in: \.horizontal\)/);
  for (const control of ['distanceStepper("Near"', 'ForEach(AlertMode.allCases)', '$preferences.isLidarEnabled', 'model.applyPreferences(preferences)', 'model.testAlert()']) assert.ok(ui.includes(control), control);
});

test('camera status and primary action precede secondary PiP and collapsed diagnostics', () => {
  const camera = content.indexOf('cameraCard');
  const status = content.indexOf('scannerStatus');
  const start = content.indexOf('scannerActions');
  const pip = content.indexOf('pictureInPictureCard');
  const advanced = content.indexOf('DisclosureGroup("Advanced")');
  assert.ok(camera < status && status < start && start < pip && pip < advanced);
  assert.ok(content.indexOf('model.checkedFrames') > advanced);
  assert.ok(content.indexOf('model.processingMs') > advanced);
  assert.ok(content.indexOf('model.centerSurfaceText') > advanced);
  assert.match(content, /DisclosureGroup\("About proximity estimates"\)/);
  assert.match(content, /Can miss objects. Not a navigation or safety aid. Camera frames stay on this iPhone./);
  assert.ok(content.indexOf('Can miss objects. Not a navigation or safety aid. Camera frames stay on this iPhone.') < content.indexOf('pictureInPictureCard'));
  assert.ok(content.indexOf('The image zone does not establish') > content.indexOf('DisclosureGroup("About proximity estimates")'));
  assert.match(ui, /Camera frames are processed on this iPhone and are not uploaded/);
});

test('everyday alerts precede progressively disclosed model explanation', () => {
  const settings = ui.slice(ui.indexOf('private struct SettingsView'));
  assert.ok(settings.indexOf('Text("Your alerts")') < settings.indexOf('Text("Offline detector")'));
  assert.match(settings, /DisclosureGroup\("About the detector"\)/);
  assert.match(settings, /Candidate mAP is worse than baseline/);
  assert.match(ui, /Green means a farther band, not a clear path/);
});

test('header explains the purpose without repeating the navigation brand', () => {
  const header = ui.slice(ui.indexOf('private var header:'), ui.indexOf('private var selectedAlerts:'));
  assert.match(header, /Object awareness/);
  assert.match(header, /Visual, spoken and vibration cues/);
  assert.doesNotMatch(header, /Text\("Clarity"\)/);
});

test('idle placeholder grows for Dynamic Type while live camera keeps its bounded frame', () => {
  const card = ui.slice(ui.indexOf('private func cameraCard'), ui.indexOf('private struct DetectionOverlay'));
  const live = card.slice(0, card.indexOf('} else {'));
  const idle = card.slice(card.indexOf('} else {'));
  assert.match(live, /\.frame\(height: height\)/);
  assert.match(idle, /\.frame\(maxWidth: \.infinity, minHeight: height\)/);
  assert.match(idle, /\.fixedSize\(horizontal: false, vertical: true\)/);
  assert.doesNotMatch(idle, /\.frame\(height: height\)|minimumScaleFactor|dynamicTypeSize\(/);
  const action = ui.slice(ui.indexOf('private var startAction:'), ui.indexOf('private var testAlertAction:'));
  assert.match(action, /\.fixedSize\(horizontal: false, vertical: true\)/);
  assert.match(content, /ScrollView/);
});

test('primary actions stack full width and keep a readable shape at accessibility text sizes', () => {
  assert.match(ui, /@Environment\(\\.dynamicTypeSize\) private var dynamicTypeSize/);
  const actions = ui.slice(ui.indexOf('private var scannerActions:'), ui.indexOf('private var header:'));
  assert.ok(actions.length > 0, 'scanner actions must be a reviewable unit');
  assert.match(actions, /ViewThatFits\(in: \.horizontal\)/);
  assert.match(actions, /VStack\(spacing: 12\)/);
  assert.match(actions, /buttonBorderShape\(\.roundedRectangle\(radius: 14\)\)/);
  assert.match(actions, /Label\("Test selected alerts", systemImage: "speaker\.wave\.2"\)/);
  assert.doesNotMatch(actions, /minimumScaleFactor|dynamicTypeSize\(\./);
});

test('settings presets and alert toggles wrap instead of colliding', () => {
  const settings = ui.slice(ui.indexOf('private struct SettingsView'));
  assert.match(settings, /@Environment\(\\.dynamicTypeSize\) private var dynamicTypeSize/);
  const presets = settings.slice(settings.indexOf('private var alertPresets:'), settings.indexOf('private func distanceStepper'));
  assert.match(presets, /dynamicTypeSize\.isAccessibilitySize/);
  assert.match(presets, /VStack\(alignment: \.leading, spacing: 12\)/);
  assert.match(presets, /\.frame\(maxWidth: \.infinity, minHeight: 44, alignment: \.leading\)/);
  assert.doesNotMatch(presets, /ViewThatFits/);
  // A switch beside a long wrapped label overlaps, so stack the label above it.
  const toggle = settings.slice(settings.indexOf('private func alertToggle'), settings.indexOf('private var alertPresets:') > settings.indexOf('private func alertToggle') ? settings.indexOf('private var alertPresets:') : settings.length);
  assert.match(toggle, /if dynamicTypeSize\.isAccessibilitySize \{/);
  assert.match(toggle, /Toggle\(isOn: binding\) \{ EmptyView\(\) \}\s*\n\s*\.labelsHidden\(\)/);
  assert.match(toggle, /\.accessibilityLabel\(mode\.title\)/);
  assert.match(toggle, /\.fixedSize\(horizontal: false, vertical: true\)/);
});
