import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const introURL = new URL('../MyEyes/IntroView.swift', import.meta.url);
const appURL = new URL('../MyEyes/MyEyesApp.swift', import.meta.url);
const projURL = new URL('../MyEyes.xcodeproj/project.pbxproj', import.meta.url);

const read = (u) => (existsSync(u) ? readFileSync(u, 'utf8') : '');

test('IntroView source exists and is wired into the Xcode target', () => {
  assert.ok(existsSync(introURL), 'IntroView.swift must exist');
  const proj = read(projURL);
  assert.match(proj, /IntroView\.swift in Sources/,
    'IntroView.swift must be compiled by the Clarity target');
});

test('intro honours reduce motion by skipping animation', () => {
  const src = read(introURL);
  assert.match(src, /@Environment\(\\\.accessibilityReduceMotion\)\s+(private\s+)?var\s+reduceMotion/,
    'must read the reduce-motion environment value');
  // The reduce-motion branch has to short-circuit both the entrance animation
  // and the repeating scan-ring pulse.
  assert.match(src, /reduceMotion\s*\?/, 'reduce-motion must select a non-animated path');
  assert.match(src, /if\s+reduceMotion\s*\{/,
    'must have an explicit reduce-motion branch that reveals content immediately');
  const branch = src.indexOf('if reduceMotion {');
  const pulseStart = src.indexOf('pulsing = true');
  assert.ok(pulseStart > branch && branch !== -1,
    'the repeating pulse must only be started after the reduce-motion early return');
});

test('intro animates a concentric scan ring around the brand eye mark', () => {
  const src = read(introURL);
  assert.match(src, /Image\("ClarityLogo"\)/, 'must use the approved coral eye artwork');
  assert.match(src, /Circle\(\)[\s\S]{0,200}\.stroke/, 'scan ring must be a stroked Circle');
  assert.match(src, /repeatForever/, 'scan ring pulse must repeat');
  assert.match(src, /scaleEffect/, 'scan ring must radiate outward via scaleEffect');
});

test('intro reveals title, tagline and the honest limitation line', () => {
  const src = read(introURL);
  assert.match(src, /"Clarity"/);
  assert.match(src, /Object awareness for your surroundings/);
  assert.match(src, /An experimental awareness tool\. Not a navigation or safety aid\./,
    'the honest limitation disclosure must be shown verbatim');
});

test('get started button meets the 44pt minimum hit target', () => {
  const src = read(introURL);
  assert.match(src, /Get started/);
  assert.match(src, /minHeight:\s*44/, 'primary button must be at least 44pt tall');
});

test('intro text scales with Dynamic Type', () => {
  const src = read(introURL);
  assert.ok(!/minimumScaleFactor/.test(src),
    'must not shrink text instead of supporting Dynamic Type');
  assert.ok(!/\.frame\(height:/.test(src),
    'must not pin fixed heights that clip large accessibility text');
});

test('seen-state persists and is replayable', () => {
  const src = read(introURL);
  const app = read(appURL);
  assert.match(app, /@AppStorage\("clarity\.introSeen"\)/,
    'app must persist first-launch state under clarity.introSeen');
  assert.match(app, /IntroView\s*[({]/, 'app must present IntroView when not yet seen');
  assert.match(src, /(@Binding|\(\)\s*->\s*Void|onFinish|onContinue)/,
    'IntroView must be dismissible so the intro can be replayed');
});

test('app still respects the system light/dark appearance', () => {
  const app = read(appURL);
  const src = read(introURL);
  assert.ok(!/preferredColorScheme/.test(app), 'app must not force a color scheme');
  assert.ok(!/preferredColorScheme/.test(src), 'intro must not force a color scheme');
});
