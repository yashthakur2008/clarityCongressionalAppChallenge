import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const root = new URL('../MyEyes/OfflineDetector/', import.meta.url);
const read = name => readFileSync(new URL(name, root), 'utf8');
const unknown = { label: 'Possible unknown object', confidence: 0,
  bbox: { x: .45, y: .65, width: .1, height: .1 }, anchor: { x: .5, y: .75 }, inZone: true };

async function runtime() {
  const replies = []; let now = 100; let breaks = 0; let proposalCalls = 0;
  const state = { known: [], proposals: [unknown], fallbackThrows: false };
  class Image { naturalWidth = 8; naturalHeight = 8; async decode() {} }
  const context = vm.createContext({
    Image, Uint8ClampedArray, Float32Array, console,
    performance: { now: () => now },
    window: { webkit: { messageHandlers: { detector: { postMessage: x => replies.push(x) } } } },
    document: { createElement: () => ({ getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(8*8*4) }) }) }) },
    ort: { env: { wasm: {} }, Tensor: class {}, InferenceSession: { create: async () => ({
      inputNames: ['images'], outputNames: ['predictions'],
      run: async () => ({ predictions: { dims: [1,3549,85], data: [], dispose() {} } })
    }) } },
    preprocessRGBA: () => ({ data: new Float32Array() }), decodeYOLOX: () => state.known,
    findUnknownObjects: () => { proposalCalls++; if (state.fallbackThrows) throw Error('appearance unavailable'); return state.proposals; },
    createUnknownObjectTracker: () => ({ update: x => x, reset: () => breaks++, breakStreak: () => breaks++ })
  });
  vm.runInContext(read('policy.js'), context);
  vm.runInContext(read('detector.js'), context);
  await new Promise(resolve => setImmediate(resolve));
  return { state, replies, get breaks() { return breaks; }, get proposalCalls() { return proposalCalls; },
    async frame(ageMs = 0) {
      now += 100;
      await context.window.analyzeOffline(String(now), '', now, { confidenceThreshold: .85, cooldownMs: 3000, alertModes: ['sound'] }, ageMs);
      return replies.at(-1);
    }, reset() { context.window.resetOffline('reset'); } };
}

test('confirmed appearance proposals bypass classifier threshold without inventing class confidence', async () => {
  const r = await runtime();
  const first = (await r.frame()).value;
  assert.equal(first.detections.length, 1);
  assert.equal(first.detections[0].label, unknown.label);
  assert.equal(first.detections[0].confidence, 0);
  assert.equal(first.alert.reason, 'confirming');
  const next = (await r.frame()).value;
  assert.equal(next.alert.triggered, true);
  assert.equal(next.alert.message, 'Possible unknown object in camera zone. Check your surroundings.');
});

test('stale frames clear unknown temporal evidence and never expose proposals', async () => {
  const r = await runtime();
  await r.frame();
  const result = (await r.frame(3000)).value;
  assert.equal(result.detections.length, 0);
  assert.equal(result.alert.reason, 'stale');
  assert.ok(r.breaks > 0);
});

test('scan reset clears unknown tracking as well as named alert policy', async () => {
  const r = await runtime(); await r.frame();
  const before = r.breaks; r.reset();
  assert.ok(r.breaks > before);
});

test('appearance candidates expire at 750ms even when named inference is still usable', async () => {
  const r = await runtime();
  r.state.known = [{ class: 'chair', score: .95, bbox: [3,4,2,2] }];
  const result = (await r.frame(800)).value;
  assert.equal(result.detections.length, 1);
  assert.equal(result.detections[0].label, 'chair');
  assert.ok(r.breaks > 0);
});

test('appearance failure preserves working named detections and breaks unknown tracking', async () => {
  const r = await runtime(); r.state.fallbackThrows = true;
  r.state.known = [{ class: 'chair', score: .95, bbox: [3,4,2,2] }];
  const result = await r.frame();
  assert.equal(result.error, undefined);
  assert.equal(result.value.detections[0].label, 'chair');
  assert.ok(r.proposalCalls > 0);
  assert.ok(r.breaks > 0);
});

test('appearance script loads before runtime without remote resources', () => {
  const html = read('index.html');
  assert.ok(html.indexOf('unknown-objects.js') >= 0);
  assert.ok(html.indexOf('unknown-objects.js') < html.indexOf('detector.js'));
});
