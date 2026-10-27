import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const file = new URL('../MyEyes/OfflineDetector/unknown-objects.js', import.meta.url);
const context = vm.createContext({});
if (fs.existsSync(file)) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
const zone = [{ x: 0.1, y: 0.45 }, { x: 0.9, y: 0.45 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
const W = 160, H = 120;
function image(floor = [165, 150, 130], width = W, height = H) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    data.set(typeof floor === 'function' ? [...floor(x, y), 255] : [...floor, 255], (y * width + x) * 4);
  }
  return data;
}
function rect(data, x, y, w, h, color, width = W) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) data.set([...color, 255], (yy * width + xx) * 4);
  return data;
}
const find = (data, known = [], polygon = zone, width = W, height = H) => context.findUnknownObjects(data, width, height, known, polygon);
const detection = (x = 0.4, y = 0.65, width = 0.1, height = 0.12) => ({ label: 'Possible unknown object', confidence: 0, bbox: { x, y, width, height }, anchor: { x: x + width / 2, y: y + height }, inZone: true });

test('exports the two plain-script global APIs', () => {
  assert.equal(typeof context.findUnknownObjects, 'function');
  assert.equal(typeof context.createUnknownObjectTracker, 'function');
});

test('generic translated dark, light and colorful objects across varied floor palettes', () => {
  const palettes = [[170, 155, 130], [65, 75, 85], [150, 150, 150], [145, 105, 85], [100, 145, 165]];
  const colors = [[15, 18, 22], [245, 240, 235], [210, 30, 55], [30, 45, 230], [35, 210, 65]];
  for (const floor of palettes) for (const color of colors) for (const x of [32, 72, 112]) {
    const result = find(rect(image(floor), x, 78, 14, 16, color));
    assert.equal(result.length, 1, `floor ${floor}, object ${color}, x ${x}`);
    const d = result[0];
    assert.equal(d.label, 'Possible unknown object'); assert.equal(d.confidence, 0); assert.equal(d.inZone, true);
    assert.ok(Math.abs(d.bbox.x - x / W) <= 2 / W);
    assert.ok(Math.abs(d.bbox.y - 78 / H) <= 2 / H);
    assert.ok(d.bbox.width > 0 && d.bbox.height > 0);
    assert.equal(d.anchor.x, d.bbox.x + d.bbox.width / 2);
    assert.equal(d.anchor.y, d.bbox.y + d.bbox.height);
  }
});

test('black-white multicolor object is one proposal, not two color classes', () => {
  const data = rect(rect(image([140, 140, 140]), 65, 78, 16, 16, [10, 10, 10]), 73, 78, 8, 16, [250, 250, 250]);
  const result = find(data);
  assert.equal(result.length, 1); assert.ok(result[0].bbox.width >= 15 / W);
});

test('uniform, low contrast, tiny specks, transparent and invalid images produce nothing', () => {
  for (const data of [image(), rect(image(), 70, 80, 15, 15, [175, 160, 140]), rect(image(), 70, 80, 2, 2, [0, 0, 0]), new Uint8ClampedArray(W * H * 4)]) assert.equal(find(data).length, 0);
  for (const [data, w, h] of [[null, W, H], [[], W, H], [image(), 0, H], [image(), NaN, H], [image(), W, 1.2]]) assert.equal(find(data, [], zone, w, h).length, 0);
  for (const polygon of [null, [], [{ x: NaN, y: 0 }, ...zone.slice(1)]]) assert.equal(find(image(), [], polygon).length, 0);
});

test('broad transitions, split floors, checkerboard flooring, rugs and seams are rejected', () => {
  const cases = [
    image((x) => x < 80 ? [180, 160, 130] : [60, 75, 90]),
    image((x, y) => y < 88 ? [180, 160, 130] : [60, 75, 90]),
    image((x, y) => (Math.floor(x / 18) + Math.floor(y / 18)) % 2 ? [180, 160, 130] : [60, 75, 90]),
    rect(image(), 35, 70, 90, 35, [35, 40, 50]),
    rect(image(), 20, 80, 120, 3, [20, 20, 20]),
    rect(image(), 80, 55, 3, 65, [20, 20, 20]),
    rect(image(), 0, 80, 30, 25, [20, 20, 20]),
  ];
  for (let i = 0; i < cases.length; i++) assert.equal(find(cases[i]).length, 0, `terrain fixture ${i}`);
});

test('gradual illumination and soft compact shadow do not become object proposals', () => {
  const ramp = image((x) => [100 + x * 0.5, 90 + x * 0.5, 80 + x * 0.5]);
  const shadow = image((x, y) => {
    const shade = 90 * Math.exp(-((x - 80) ** 2 + (y - 85) ** 2) / 190);
    return [180 - shade, 170 - shade, 155 - shade];
  });
  assert.equal(find(ramp).length, 0); assert.equal(find(shadow).length, 0);
});

test('only enclosed polygon objects count and candidate count is bounded', () => {
  assert.equal(find(rect(image(), 70, 20, 15, 15, [0, 0, 0])).length, 0);
  const data = image();
  for (const x of [25, 55, 85, 115]) rect(data, x, 80, 12, 12, [0, 0, 0]);
  assert.equal(find(data).length, 3);
  assert.equal(find(rect(image(), 65, 80, 15, 15, [0, 0, 0]), [], zone.map(p => [p.x, p.y])).length, 1);
});

test('known bbox containment and substantial overlap suppress but distant boxes do not', () => {
  const data = rect(image(), 64, 78, 16, 16, [0, 0, 0]);
  assert.equal(find(data, [{ bbox: { x: 0.3, y: 0.6, width: 0.3, height: 0.3 } }]).length, 0);
  assert.equal(find(data, [{ bbox: { x: 0.43, y: 0.65, width: 0.1, height: 0.15 } }]).length, 0);
  assert.equal(find(data, [{ bbox: { x: 0.43, y: 0.68, width: 0.02, height: 0.02 } }]).length, 0);
  assert.equal(find(data, [{ bbox: { x: 0.1, y: 0.1, width: 0.1, height: 0.1 } }, {}]).length, 1);
});

test('higher resolution images are analyzed with normalized output', () => {
  const data = rect(image([170, 150, 130], 640, 480), 256, 312, 64, 64, [20, 20, 20], 640);
  const result = find(data, [], zone, 640, 480);
  assert.equal(result.length, 1); assert.ok(Math.abs(result[0].bbox.x - 0.4) < 0.02);
});

test('tracker requires three fresh consecutive observations, updates position, never caches missing detections', () => {
  const tracker = context.createUnknownObjectTracker();
  assert.equal(tracker.update([detection()], 100).length, 0);
  assert.equal(tracker.update([detection(0.405)], 200).length, 0);
  assert.equal(tracker.update([detection(0.41)], 300)[0].bbox.x, 0.41);
  assert.equal(tracker.update([], 400).length, 0);
  assert.equal(tracker.update([detection()], 500).length, 0);
  assert.equal(tracker.update([detection()], 600).length, 0);
  assert.equal(tracker.update([detection()], 700).length, 1);
  tracker.breakStreak(); assert.equal(tracker.update([detection()], 800).length, 0);
  tracker.reset(); assert.equal(tracker.update([detection()], 0).length, 0);
});

test('tracker breaks on stale, repeated, reversed and invalid timestamps', () => {
  for (const bad of [200, 150, 951, NaN, Infinity, undefined]) {
    const tracker = context.createUnknownObjectTracker();
    tracker.update([detection()], 100); tracker.update([detection()], 200);
    assert.equal(tracker.update([detection()], bad).length, 0, `bad time ${bad}`);
    assert.equal(tracker.update([detection()], 1000).length, 0);
  }
  const tracker = context.createUnknownObjectTracker();
  tracker.update([detection()], 0); tracker.update([detection()], 750);
  assert.equal(tracker.update([detection()], 1500).length, 1);
});

test('tracker bounds movement and size, matches one-to-one and ignores malformed candidates', () => {
  for (const changed of [detection(0.65), detection(0.4, 0.65, 0.25, 0.25)]) {
    const tracker = context.createUnknownObjectTracker();
    tracker.update([detection()], 100); tracker.update([detection()], 200);
    assert.equal(tracker.update([changed], 300).length, 0);
  }
  const tracker = context.createUnknownObjectTracker();
  tracker.update([detection()], 100); tracker.update([detection(), detection(0.405)], 200);
  assert.equal(tracker.update([detection(), detection(0.405)], 300).length, 1);
  assert.equal(tracker.update([{}, null, detection(NaN)], 400).length, 0);
});

test('actual app corridor supports textured floors and multiple simultaneous object colors', () => {
  const corridor = [{ x: 0.38, y: 0.42 }, { x: 0.62, y: 0.42 }, { x: 0.95, y: 1 }, { x: 0.05, y: 1 }];
  const data = image((x, y) => {
    const variation = ((x * 17 + y * 31) % 19) - 9;
    return [155 + variation, 140 + variation, 125 + variation];
  });
  rect(data, 52, 84, 12, 14, [15, 20, 25]);
  rect(data, 94, 84, 12, 14, [240, 245, 250]);
  const before = data.slice();
  assert.equal(find(data, [], corridor).length, 2);
  assert.deepEqual(data, before, 'input RGBA is not mutated');
  assert.equal(find(rect(image(), 10, 65, 12, 14, [0, 0, 0]), [], corridor).length, 0);
});

test('invalid sparse polygons fail closed instead of throwing', () => {
  const sparse = new Array(4); sparse[0] = { x: 0, y: 0 };
  assert.equal(find(image(), [], sparse).length, 0);
});

test('diagonal stripes and three-color flooring do not produce compact object proposals', () => {
  const stripe = image((x, y) => Math.abs(x - y) < 2 ? [5, 5, 5] : [165, 150, 130]);
  const tiles = image((x, y) => [[30, 40, 50], [130, 110, 90], [225, 215, 205]][(Math.floor(x / 15) + Math.floor(y / 15)) % 3]);
  assert.equal(find(stripe).length, 0);
  assert.equal(find(tiles).length, 0);
});

test('tracker follows reordered objects independently and snapshots caller-owned bboxes', () => {
  const tracker = context.createUnknownObjectTracker();
  const left = detection(0.2), right = detection(0.7);
  tracker.update([left, right], 100);
  tracker.update([right, left], 200);
  const confirmed = tracker.update([left, right], 300);
  assert.equal(confirmed.length, 2);
  confirmed[0].bbox.x = 0.95;
  left.bbox.x = 0.9;
  assert.equal(tracker.update([detection(0.2), right], 400).length, 2);
  assert.equal(tracker.update([right], 500).length, 1);
  assert.equal(tracker.update([detection(0.2), right], 600).length, 1);
});
