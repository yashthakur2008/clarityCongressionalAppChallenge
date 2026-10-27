import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The first native suite runs before Xcode has produced a bundle. Its optional
// compiled-metadata assertion must run again after build, before artifact upload.
test('native CI verifies compiled app metadata after build and before upload', () => {
  const workflow = readFileSync(new URL('../../../.github/workflows/ios-pip.yml', import.meta.url), 'utf8');
  const steps = workflow.split(/^      - name: /m).slice(1);
  const build = steps.findIndex(step => /\bxcodebuild\b/.test(step));
  const verify = steps.findIndex(step => /CLARITY_BUILT_APP:/.test(step));
  const upload = steps.findIndex(step => /actions\/upload-artifact@/.test(step));
  assert.ok(build >= 0, 'native workflow must build the application');
  assert.ok(verify > build, 'compiled-bundle check must run after the build, not only before it');
  assert.ok(upload > verify, 'compiled-bundle check must succeed before upload');
  assert.match(steps[verify], /CLARITY_BUILT_APP:\s*DerivedData\/Build\/Products\/Debug-iphonesimulator\/Clarity\.app/);
  assert.match(steps[verify], /run:\s*node --test samples\/ios\/tests\/app-icon\.test\.mjs/);
  assert.doesNotMatch(steps[verify], /continue-on-error:\s*true|if:\s*false/);
});
