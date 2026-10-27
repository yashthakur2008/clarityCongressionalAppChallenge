// Source-contract tests for the Android near-object alert path.
//
// This machine has a JDK but NO Android SDK, so samples/android has never been compiled here.
// These checks are therefore source contracts, not a compile or a runtime test: they assert the
// API calls and manifest entries that the "break through whatever the user is doing" behavior
// depends on, and that every XML resource parses. They cannot prove the app builds or runs.
//
// Run: node samples/android/tests/alerts.test.mjs

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

let failures = 0;
let checks = 0;
function check(name, condition, hint = "") {
  checks += 1;
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${hint ? ` — ${hint}` : ""}`);
  }
}
function group(name, body) {
  console.log(`\n${name}`);
  body();
}

const manifest = read("app/src/main/AndroidManifest.xml");
const alerts = read("app/src/main/java/dev/myeyes/sample/ProximityAlerts.java");
const activity = read("app/src/main/java/dev/myeyes/sample/AlertActivity.java");
const service = read("app/src/main/java/dev/myeyes/sample/ScannerService.java");

group("AndroidManifest", () => {
  check(
    "declares USE_FULL_SCREEN_INTENT",
    /<uses-permission\s+android:name="android\.permission\.USE_FULL_SCREEN_INTENT"\s*\/>/.test(manifest),
    "full-screen intents are silently dropped without it",
  );
  check("declares VIBRATE", /android\.permission\.VIBRATE/.test(manifest));
  check("declares POST_NOTIFICATIONS", /android\.permission\.POST_NOTIFICATIONS/.test(manifest));
  const alertActivity = manifest.match(/<activity[^>]*\.AlertActivity[\s\S]*?\/>/);
  check("registers .AlertActivity", Boolean(alertActivity));
  if (alertActivity) {
    const block = alertActivity[0];
    check("AlertActivity is not exported", /android:exported="false"/.test(block));
    check("AlertActivity showWhenLocked", /android:showWhenLocked="true"/.test(block));
    check("AlertActivity turnScreenOn", /android:turnScreenOn="true"/.test(block));
    check("AlertActivity excluded from recents", /android:excludeFromRecents="true"/.test(block));
    check("AlertActivity uses the full-screen AlertTheme", /android:theme="@style\/AlertTheme"/.test(block));
  }
});

group("ProximityAlerts: channel", () => {
  check(
    "channel uses IMPORTANCE_HIGH",
    /new NotificationChannel\([\s\S]{0,200}NotificationManager\.IMPORTANCE_HIGH/.test(alerts),
    "anything lower cannot produce a heads-up or full-screen alert",
  );
  check('channel is named "Proximity alerts"', /CHANNEL_PROXIMITY_NAME\s*=\s*"Proximity alerts"/.test(alerts));
  check("calls setBypassDnd(true)", /setBypassDnd\(true\)/.test(alerts));
  check(
    "setBypassDnd degrades gracefully",
    /try\s*\{\s*channel\.setBypassDnd\(true\);\s*\}\s*catch/.test(alerts),
    "bypassDnd only applies with a user-granted DND override; it must not crash",
  );
  check("channel sound uses alarm attributes", /setSound\(alarm,\s*alarmAttributes\(\)\)/.test(alerts));
  check("channel is public on the lock screen", /setLockscreenVisibility\(Notification\.VISIBILITY_PUBLIC\)/.test(alerts));
});

group("ProximityAlerts: full-screen intent", () => {
  check(
    "builds with setFullScreenIntent(pendingIntent, true)",
    /setFullScreenIntent\(full,\s*true\)/.test(alerts),
  );
  check("uses CATEGORY_ALARM", /setCategory\(Notification\.CATEGORY_ALARM\)/.test(alerts));
  check("uses PRIORITY_HIGH", /setPriority\(Notification\.PRIORITY_HIGH\)/.test(alerts));
  check(
    "checks canUseFullScreenIntent() on API 34+",
    /SDK_INT\s*>=\s*34\)\s*return\s+manager\.canUseFullScreenIntent\(\)/.test(alerts),
    "API 34+ restricts USE_FULL_SCREEN_INTENT",
  );
  check(
    "has an explicit fallback branch",
    /boolean fullScreen = canUseFullScreenIntent\(context\);[\s\S]{0,200}if \(fullScreen\)/.test(alerts),
    "when denied the notification must still post as heads-up only",
  );
  check(
    "raise() reports whether full-screen was used",
    /return fullScreen;/.test(alerts),
    "callers need to know to fall back to local tone/vibration",
  );
  check("pending intent is immutable", /PendingIntent\.FLAG_IMMUTABLE/.test(alerts));
  check("alert intent starts a new task", /FLAG_ACTIVITY_NEW_TASK/.test(alerts));
});

group("ProximityAlerts: audio routing", () => {
  check(
    "channel attributes use USAGE_ALARM",
    /setUsage\(AudioAttributes\.USAGE_ALARM\)/.test(alerts),
    "alarm usage stays audible when the ringer is silenced",
  );
  check("uses SONIFICATION content type", /CONTENT_TYPE_SONIFICATION/.test(alerts));
});

group("AlertActivity", () => {
  check('shows the "Watch out" title', /ALERT_TITLE\s*=\s*"Watch out"/.test(alerts));
  check("renders the title", /setText\(ProximityAlerts\.ALERT_TITLE\)/.test(activity));
  check("renders the detected label", /EXTRA_LABEL/.test(activity));
  check('has a "Dismiss" button', /DISMISS_LABEL\s*=\s*"Dismiss"/.test(alerts) && /Button dismiss/.test(activity));
  check("dismiss finishes the task", /dismiss\.setOnClickListener\(view -> finishAndRemoveTask\(\)\)/.test(activity));
  check("calls setShowWhenLocked(true)", /setShowWhenLocked\(true\)/.test(activity));
  check("calls setTurnScreenOn(true)", /setTurnScreenOn\(true\)/.test(activity));
  check(
    "guards window APIs for API < 27",
    /SDK_INT\s*>=\s*27/.test(activity) && /FLAG_SHOW_WHEN_LOCKED/.test(activity),
    "minSdk is 26",
  );
  check(
    "vibrates with a short sharp VibrationEffect waveform",
    /VibrationEffect\.createWaveform\(new long\[\]\s*\{0, 160, 70, 160\}, -1\)/.test(activity),
  );
  check("vibration uses alarm usage on API 33+", /VibrationAttributes\.USAGE_ALARM/.test(activity));
  check(
    "plays the tone through USAGE_ALARM attributes",
    /setAudioAttributes\([\s\S]{0,200}AudioAttributes\.USAGE_ALARM/.test(activity),
  );
  check("plays at full volume", /setVolume\(1f, 1f\)/.test(activity));
  check("reads the alarm stream volume", /AudioManager\.STREAM_ALARM/.test(activity));
  check("auto-dismisses after a few seconds", /AUTO_DISMISS_MS/.test(activity) && /AUTO_DISMISS_MS\s*=\s*\d+/.test(alerts));
  check("releases the player and vibrator", /stopFeedback\(\)/.test(activity) && /player\.release\(\)/.test(activity));
});

group("ScannerService wiring", () => {
  check("creates the proximity channel", /ProximityAlerts\.createChannel\(this\)/.test(service));
  check("raises the alert when triggered", /ProximityAlerts\.raise\(this,/.test(service));
  check(
    "falls back to local tone/vibration when not full-screen",
    /if \(!fullScreen\) testAlert\(alertSound, alertVibration\)/.test(service),
  );
  check("clears the alert on stop", /ProximityAlerts\.clear\(this\)/.test(service));
  check("keeps the low-importance scanning channel separate", /IMPORTANCE_LOW/.test(service));
});

group("Cross-platform wording", () => {
  // Both apps must say the same thing. Android owns the canonical strings here.
  check('canonical title is "Watch out"', /"Watch out"/.test(alerts));
  check("fallback detail mentions the camera zone", /ALERT_DETAIL_FALLBACK\s*=\s*"Object close in the camera zone\./.test(alerts));
});

// Minimal well-formedness parse: enough to catch unbalanced tags and bad entities.
function parseXml(text, label) {
  const stripped = text
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  const stack = [];
  const tag = /<\s*(\/?)([A-Za-z_][\w.:-]*)([^>]*?)(\/?)\s*>/g;
  let match;
  let index = 0;
  while ((match = tag.exec(stripped)) !== null) {
    const between = stripped.slice(index, match.index);
    if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(between)) {
      return `${label}: unescaped & in text`;
    }
    index = tag.lastIndex;
    const [, closing, name, attrs, selfClose] = match;
    const quotes = (attrs.match(/"/g) || []).length;
    if (quotes % 2 !== 0) return `${label}: unbalanced quote in <${name}>`;
    if (closing) {
      if (stack.pop() !== name) return `${label}: </${name}> does not close the open element`;
    } else if (!selfClose) {
      stack.push(name);
    }
  }
  if (stack.length) return `${label}: unclosed <${stack[stack.length - 1]}>`;
  return null;
}

group("XML resources parse", () => {
  const files = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".xml")) files.push(full);
    }
  })(join(root, "app/src/main"));
  check("found XML resources", files.length > 0);
  for (const file of files) {
    const rel = file.slice(root.length + 1);
    const error = parseXml(readFileSync(file, "utf8"), rel);
    check(`parses ${rel}`, error === null, error || "");
  }
});

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.log("NOTE: source contracts only. No Android SDK on this machine, so nothing was compiled.");
  process.exit(1);
}
console.log("Source contracts hold. NOT a compile: no Android SDK present, so the app was never built here.");
