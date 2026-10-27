/* All assets are packaged in the app. The WKWebView has no HTTP(S) navigation or fetch access. */
'use strict';
let detector;
let policy;
let settingsKey;
let busy = false;
const unknownTracker = createUnknownObjectTracker();
const reply = payload => window.webkit.messageHandlers.detector.postMessage(payload);
const readyValue = () => ({ backend: 'ONNX WASM · experimental YOLOX-Nano', zone: ZONE });

// A new scan must not inherit confirmation or cooldown from the preceding scan.
// Native startup waits for this acknowledgement before it accepts camera frames.
window.resetOffline = function (id) {
  if (!detector) { reply({ id, error: 'Offline detector not ready' }); return; }
  if (busy) { reply({ id, error: 'Detector already processing a frame' }); return; }
  policy = undefined;
  settingsKey = undefined;
  unknownTracker.reset();
  reply({ id, value: readyValue() });
};

async function initialize() {
  try {
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    ort.env.wasm.wasmPaths = 'stepsense://offline/';
    detector = await ort.InferenceSession.create('stepsense://offline/candidate.onnx', { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    if (detector.inputNames[0] !== 'images' || detector.outputNames[0] !== 'predictions') throw new Error('Unexpected model contract');
    reply({ id: 'ready', value: readyValue() });
  } catch (error) { reply({ id: 'ready', error: String(error) }); }
}

window.analyzeOffline = async function (id, jpeg, sequence, preferences, ageMs) {
  if (busy) { reply({ id, error: 'Detector already processing a frame' }); return; }
  busy = true;
  const start = performance.now();
  try {
    if (!detector) throw new Error('Offline detector not ready');
    const nextKey = JSON.stringify([preferences.cooldownMs, preferences.confidenceThreshold, preferences.alertModes]);
    if (nextKey !== settingsKey) {
      policy = createAlertPolicy({ cooldownMs: preferences.cooldownMs });
      unknownTracker.reset();
      settingsKey = nextKey;
    }
    const image = new Image();
    image.src = 'data:image/jpeg;base64,' + jpeg;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const input = preprocessRGBA(rgba, canvas.width, canvas.height);
    const outputs = await detector.run({ images: new ort.Tensor('float32', input.data, [1, 3, 416, 416]) });
    let predictions;
    try {
      const output = outputs.predictions;
      if (JSON.stringify(output.dims) !== '[1,3549,85]') throw new Error('Unexpected output shape');
      predictions = decodeYOLOX(output.data, canvas.width, canvas.height, preferences.confidenceThreshold);
    } finally { for (const output of Object.values(outputs)) output.dispose(); }
    let stale = ageMs + performance.now() - start > 2500;
    let detections = stale ? [] : assessDetections(predictions, image.naturalWidth, image.naturalHeight, preferences.confidenceThreshold);
    if (!stale && ageMs + performance.now() - start < 750) {
      try {
        // A separate appearance heuristic, not an extra model class or classifier score.
        const proposals = findUnknownObjects(rgba, canvas.width, canvas.height, detections, ZONE);
        detections.push(...unknownTracker.update(proposals, start - ageMs));
      } catch {
        // A failed fallback must not disable otherwise healthy named-object inference.
        unknownTracker.breakStreak();
      }
    } else { unknownTracker.breakStreak(); }
    const elapsed = performance.now() - start;
    if (ageMs + elapsed >= 750) {
      detections = detections.filter(item => item.label !== 'Possible unknown object');
      unknownTracker.breakStreak();
    }
    stale = ageMs + elapsed > 2500;
    let alert;
    if (stale) {
      detections = [];
      unknownTracker.breakStreak();
      policy.breakStreak();
      alert = { triggered: false, reason: 'stale', modalities: [], message: null, cooldownRemainingMs: 0 };
    } else {
      alert = policy.update(detections, performance.now());
      if (alert.triggered) {
        alert.modalities = preferences.alertModes;
        const inZone = detections.filter(item => item.inZone);
        if (inZone.length && inZone.every(item => item.label === 'Possible unknown object')) {
          alert.message = 'Possible unknown object in camera zone. Check your surroundings.';
        }
      }
    }
    reply({ id, value: { frame: { sequence, width: image.naturalWidth, height: image.naturalHeight }, detections, alert, processingMs: Math.round(elapsed) } });
  } catch (error) {
    if (policy) policy.breakStreak();
    unknownTracker.breakStreak();
    reply({ id, error: String(error) });
  } finally { busy = false; }
};
initialize();
