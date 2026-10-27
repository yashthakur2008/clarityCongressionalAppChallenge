import test from 'node:test';
import assert from 'node:assert/strict';
import { CameraFeature } from './camera.js';
import { createLocalDetector, createAlertPolicy } from './local-detector.js';

const drain = () => new Promise(resolve => setImmediate(resolve));

// Real camera/detector lifecycle and policies; only media, model and clocks are controlled.
async function cameraSession(t, { seconds = 3, preferences, context = value => value,
  wall = time => 1800000000000 + time, cameraOffset = 0, detectorOffset = 0 } = {}) {
  let time = 0, nextId = 0;
  const timers = new Map(), events = [], results = [];
  const schedule = (callback, delay) => {
    const id = ++nextId;
    timers.set(id, { callback, due: time + delay });
    return id;
  };
  const unschedule = id => timers.delete(id);
  const video = { videoWidth: 640, videoHeight: 480, readyState: 4, currentTime: 1,
    paused: true, ended: false, srcObject: null,
    async play() { this.paused = false; }, pause() { this.paused = true; } };
  const feature = new CameraFeature({ video, mediaDevices: { async getUserMedia() {
    const track = { readyState: 'live', muted: false, stop() { this.readyState = 'ended'; }, addEventListener() {} };
    return { getTracks: () => [track], getVideoTracks: () => [track] };
  } }, now: () => time + cameraOffset, schedule, unschedule,
  emit(name) { if (name === 'camera:obstacle') events.push(time); } });
  feature.cooldownMs = seconds * 1000;
  const detector = createLocalDetector({
    loader: async () => ({ detect: async () => [{ class: 'backpack', score: .9, bbox: [240, 240, 160, 200] }] }),
    createCanvas: () => ({ getContext: () => ({ drawImage() {} }) }),
    now: () => time + detectorOffset, schedule, unschedule, minIntervalMs: 100,
    ...(preferences ? { preferences } : {}),
  });
  feature.registerDetector({ prepare: value => detector.prepare(value), start: value => detector.start(context({
    ...value, onResult(result) {
      results.push({ at: time, ...result });
      value.onResult(result);
    },
  })) });
  t.mock.method(Date, 'now', () => wall(time));
  t.after(() => { feature.destroy(); assert.equal(timers.size, 0, 'Destroy clears all scheduled work'); });
  const start = async () => {
    await feature.start(); await drain();
    assert.equal(feature.state.phase, 'active');
    assert.equal(feature.detectionRunning, true);
  };
  await start();
  return { feature, events, results, start, timers,
    async advanceTo(target) {
      while (true) {
        const next = [...timers].sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
        if (!next || next[1].due > target) break;
        const [id, item] = next;
        time = item.due; video.currentTime = 1 + time / 1000;
        timers.delete(id); item.callback(); await drain();
      }
      time = target; video.currentTime = 1 + time / 1000;
    },
  };
}

for (const [seconds, expected] of [
  [1, [100, 1100, 2100, 3100, 4100, 5100]],
  [3, [100, 3100]],
  [5, [100, 5100]],
]) {
  test(`local detector and camera deliver the selected ${seconds}s interval`, async t => {
    const run = await cameraSession(t, { seconds });
    await run.advanceTo(5100);
    assert.deepEqual(run.events, expected);
    assert.equal(run.results[0].alert.reason, 'confirming');
    assert.equal(run.results[1].alert.cooldownRemainingMs, seconds * 1000);
    assert.equal(run.results[2].alert.reason, 'cooldown');
    assert.equal(run.results[2].alert.cooldownRemainingMs, seconds * 1000 - 100);
    assert.equal(run.feature.state.phase, 'active');
    assert.equal(run.results.length, 52, 'Missing repeats must not be explained by missing frames');
  });
}

for (const [before, after, expected] of [
  [3, 1, [100, 1100, 2100, 3100, 4100, 5100]],
  [1, 5, [100, 5100]],
]) {
  test(`live ${before}s -> ${after}s preference preserves last-alert history`, async t => {
    const run = await cameraSession(t, { seconds: before });
    await run.advanceTo(600);
    assert.deepEqual(run.events, [100]);
    run.feature.cooldownMs = after * 1000;
    await run.advanceTo(700);
    assert.deepEqual(run.events, [100], 'Changing delay must not reset the last alert');
    await run.advanceTo(5100);
    assert.deepEqual(run.events, expected);
  });
}

test('changing cooldown during initial confirmation keeps the first qualifying frame', async t => {
  const run = await cameraSession(t);
  await run.advanceTo(50);
  run.feature.cooldownMs = 1000;
  await run.advanceTo(1100);
  assert.deepEqual(run.events, [100, 1100]);
});

test('stop/restart resets confirmation and cooldown while retaining the live selection', async t => {
  const run = await cameraSession(t, { seconds: 1 });
  await run.advanceTo(1600);
  assert.deepEqual(run.events, [100, 1100]);
  run.feature.stop();
  assert.equal(run.timers.size, 0);
  run.feature.cooldownMs = 5000;
  await run.start();
  assert.equal(run.results.at(-1).alert.reason, 'confirming');
  assert.deepEqual(run.events, [100, 1100]);
  await run.advanceTo(6700);
  assert.deepEqual(run.events, [100, 1100, 1700, 6700]);
});

for (const [name, getter] of [
  ['absent', undefined], ['non-function', 42], ['NaN', () => NaN], ['infinity', () => Infinity],
  ['negative', () => -1], ['null', () => null], ['string', () => '1000'],
  ['throwing', () => { throw new Error('Unavailable setting'); }],
]) {
  test(`${name} live cooldown getter preserves the factory fallback`, async t => {
    const run = await cameraSession(t, { seconds: 2,
      preferences: { confidenceThreshold: .45, cooldownMs: 2000 },
      context: value => ({ ...value, getCooldownMs: getter }),
    });
    await run.advanceTo(4100);
    assert.deepEqual(run.events, [100, 2100, 4100]);
    assert.equal(run.results[1].alert.cooldownRemainingMs, 2000);
  });
}

test('absent live getter preserves default local cooldown', async t => {
  const run = await cameraSession(t, { context: value => ({ ...value, getCooldownMs: undefined }) });
  await run.advanceTo(3100);
  assert.deepEqual(run.events, [100, 3100]);
});

for (const [name, wall] of [
  ['frozen wall clock', () => 1800000000000],
  ['backward wall clock', time => 1800000000000 - time * 3],
  ['forward wall jump', time => 1800000000000 + time + (time >= 500 ? 60000 : 0)],
]) {
  test(`${name} cannot desynchronize local and camera cooldowns`, async t => {
    const run = await cameraSession(t, { wall, cameraOffset: 50000, detectorOffset: 1000 });
    await run.advanceTo(6100);
    assert.deepEqual(run.events, [100, 3100, 6100]);
  });
}

test('live policy callback falls back without discarding its existing alert history', () => {
  let value = 1000;
  const policy = createAlertPolicy({ cooldownMs: 3000, getCooldownMs: () => value });
  const item = { label: 'chair', confidence: .8, bbox: { x: .4, y: .6, width: .2, height: .3 }, inZone: true };
  assert.equal(policy.update([item], 0).reason, 'confirming');
  assert.equal(policy.update([item], 100).triggered, true);
  assert.equal(policy.update([item], 1100).triggered, true);
  value = NaN;
  assert.equal(policy.update([item], 1200).cooldownRemainingMs, 2900);
  value = 5000;
  assert.equal(policy.update([item], 1300).cooldownRemainingMs, 4800);
});
