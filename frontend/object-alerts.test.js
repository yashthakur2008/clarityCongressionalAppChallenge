import test from 'node:test';
import assert from 'node:assert/strict';
import { notifyPhone } from './phone-notifications.js';
import { createObjectAlerts, mountObjectAlerts, vibrationPattern } from './object-alerts.js';

function fixture(permission = 'granted') {
  const notices = [], vibrations = [];
  class NotificationApi {
    static permission = permission;
    static requestPermission() { throw new Error('Detection must not request permission'); }
    constructor() { throw new Error('Mobile notifications require a service worker'); }
  }
  const registration = { async showNotification(title, options) { notices.push({ title, options }); } };
  const platform = { Notification: NotificationApi, navigator: {
    serviceWorker: { getRegistration: async () => registration },
    vibrate(pattern) { vibrations.push(pattern); return true; },
  } };
  const prefs = { notifications: true, vibration: true, strength: 65, repeatCount: 1 };
  const alerts = createObjectAlerts({ platform, readPreferences: () => prefs });
  return { platform, notices, vibrations, prefs, alerts, registration };
}

test('confirmed alert posts one replaceable notification with the chosen vibration and no second page vibration', async () => {
  const f = fixture();
  const delivered = await f.alerts.send('Object in the camera alert zone.');
  assert.equal(delivered.notification, true);
  assert.equal(f.notices.length, 1);
  assert.equal(f.notices[0].title, 'Clarity: object ahead');
  assert.deepEqual(f.notices[0].options.vibrate, [167, 98, 167]);
  assert.equal(f.notices[0].options.data.url, '/#camera');
  assert.deepEqual(f.vibrations, []);
  await f.alerts.send('Next confirmed alert.');
  assert.equal(f.notices[0].options.tag, f.notices[1].options.tag);
});

test('vibration off makes the notification silent and omits its vibration pattern', async () => {
  const f = fixture(); f.prefs.vibration = false;
  await f.alerts.send('Object ahead.');
  assert.equal(f.notices[0].options.silent, true);
  assert.equal('vibrate' in f.notices[0].options, false);
  assert.deepEqual(f.vibrations, []);
});

test('notifications off and unsupported or denied notifications use only selected page vibration without prompting', async () => {
  for (const permission of ['default', 'denied', 'granted']) {
    const f = fixture(permission); if (permission === 'granted') f.prefs.notifications = false;
    assert.deepEqual(await f.alerts.send('Object ahead.'), { notification: false, vibration: true });
    assert.deepEqual(f.notices, []);
    assert.deepEqual(f.vibrations, [[167, 98, 167]]);
  }
  const f = fixture(); delete f.platform.Notification; delete f.platform.navigator.vibrate;
  assert.deepEqual(await f.alerts.send('Object ahead.'), { notification: false, vibration: false });
});

test('Stop or detector failure cancels pending notification lookup and vibration without late delivery', async () => {
  const f = fixture(); let resolve;
  f.platform.navigator.serviceWorker.getRegistration = () => new Promise(yes => { resolve = yes; });
  const pending = f.alerts.send('Object ahead.');
  f.alerts.cancel(); resolve(f.registration);
  await pending;
  assert.deepEqual(f.notices, []);
  assert.deepEqual(f.vibrations, [0]);
});

test('live preferences are checked again after an asynchronous worker lookup', async () => {
  const f = fixture(); let resolve;
  f.platform.navigator.serviceWorker.getRegistration = () => new Promise(yes => { resolve = yes; });
  const pending = f.alerts.send('Object ahead.');
  f.prefs.vibration = false; resolve(f.registration); await pending;
  assert.equal(f.notices[0].options.silent, true);
  assert.equal('vibrate' in f.notices[0].options, false);
  const pendingOff = f.alerts.send('Object ahead.');
  f.prefs.notifications = false; resolve(f.registration); await pendingOff;
  assert.equal(f.notices.length, 1);
});

test('notification failure falls back to vibration; test alerts carry a separate label and tag', async () => {
  const f = fixture();
  await f.alerts.send('Test alert.', { test: true });
  assert.equal(f.notices[0].title, 'Clarity: test alert');
  assert.equal(f.notices[0].options.tag, 'clarity-test-alert');
  f.registration.showNotification = async () => { throw new Error('Unavailable'); };
  assert.equal((await f.alerts.send('Object ahead.')).vibration, true);
});

test('direct notification fallback remains silent unless explicitly supplied a vibration pattern', async () => {
  const sent = [];
  class NotificationApi { static permission = 'granted'; constructor(title, options) { sent.push({ title, options }); } }
  assert.equal(await notifyPhone('Object ahead.', { Notification: NotificationApi }), true);
  assert.equal(sent[0].options.silent, true);
  assert.equal('vibrate' in sent[0].options, false);
});

test('zero strength disables vibration; repeated patterns maintain alternating pulse and pause positions', () => {
  assert.equal(vibrationPattern(0, 5), false);
  const pattern = vibrationPattern(65, 2);
  assert.deepEqual(pattern, [167, 98, 167, 200, 167, 98, 167]);
  assert.equal(pattern.length % 2, 1);
  assert.equal(vibrationPattern(100, 99).length, 19);
});


test('vibrating notifications use API-valid options rather than silently falling back', async () => {
  const f = fixture();
  f.registration.showNotification = async (title, options) => {
    if (options.silent && 'vibrate' in options) throw new TypeError('silent notifications cannot vibrate');
    f.notices.push({ title, options });
  };
  assert.equal((await f.alerts.send('Object ahead.')).notification, true);
  assert.equal(f.notices[0].options.silent, false);
  assert.deepEqual(f.vibrations, []);
});

test('failed notification fallback rechecks vibration preferences after lookup', async () => {
  const f = fixture(); let resolve;
  f.platform.navigator.serviceWorker.getRegistration = () => new Promise(yes => { resolve = yes; });
  f.registration.showNotification = async () => { throw new Error('Unavailable'); };
  const pending = f.alerts.send('Object ahead.');
  f.prefs.vibration = false; resolve(f.registration);
  assert.equal((await pending).vibration, false);
  assert.deepEqual(f.vibrations, []);
});

test('mounted alert controls unlock sound and change presets without out-of-scope references', async () => {
  const listeners = {}, elements = {};
  for (const id of ['alert', 'alertSound', 'alertVolume', 'camera-alert-output-status']) {
    elements[id] = { value: '', addEventListener(type, callback) { listeners[id + ':' + type] = callback; } };
  }
  elements.alert.value = 'sound'; elements.alertSound.value = 'ping'; elements.alertVolume.value = '70';
  const doc = { getElementById: id => elements[id], addEventListener(type, callback) { listeners[type] = callback; } };
  const oscillators = [];
  let contexts = 0;
  class AudioContext {
    constructor() { contexts++; }
    state = 'running'; currentTime = 0; destination = {};
    createGain() { return { connect() {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} } }; }
    createOscillator() {
      const oscillator = { frequency: {}, connect() {}, start() { this.started = true; }, stop() { this.stopped = true; } };
      oscillators.push(oscillator); return oscillator;
    }
  }
  const platform = { AudioContext, addEventListener(type, callback) { listeners[type] = callback; } };
  const alerts = mountObjectAlerts(doc, platform, { enableSpeech() {} });
  listeners.pointerdown(); listeners.keydown();
  assert.equal(contexts, 1);
  listeners['alertSound:change']();
  const delivery = await alerts.send('Object ahead.');
  assert.equal(delivery.sound, true);
  assert.equal(oscillators.length, 1);
  assert.equal(oscillators[0].started, true);
  alerts.cancel();
  assert.equal(oscillators[0].stopped, true);
});

// Control only external audio/storage boundaries. The alert lifecycle is the
// real module, and deferred decodes make cancellation/replacement deterministic.
function customSoundFixture() {
  const deliveries = [], played = [], stopped = [], decodeLabels = [], decodes = [], waiters = [];
  let storedLabel = 'A';
  class AudioContext {
    state = 'running'; currentTime = 0; destination = {};
    decodeAudioData(bytes) {
      let resolve, reject;
      const result = new Promise((yes, no) => { resolve = yes; reject = no; });
      const decode = { label: new TextDecoder().decode(bytes), resolve, reject };
      decodeLabels.push(decode.label);
      if (waiters.length) waiters.shift()(decode); else decodes.push(decode);
      return result;
    }
    createGain() { return { gain: {}, connect() {} }; }
    createBufferSource() {
      return { buffer: null, connect() {}, start() { played.push(this.buffer.label); }, stop() { stopped.push(this.buffer.label); } };
    }
  }
  const platform = { AudioContext, indexedDB: { open() {
    const request = {};
    queueMicrotask(() => {
      request.result = { objectStoreNames: { contains: () => true }, close() {}, transaction() {
        return { objectStore: () => ({ get() {
          const read = {};
          queueMicrotask(() => {
            const label = storedLabel;
            read.result = { arrayBuffer: async () => new TextEncoder().encode(label).buffer };
            read.onsuccess();
          });
          return read;
        } }) };
      } };
      request.onsuccess();
    });
    return request;
  } } };
  const prefs = { notifications: false, vibration: false, sound: true, soundPreset: 'custom', volume: 70, repeatCount: 1 };
  const alerts = createObjectAlerts({ platform, readPreferences: () => prefs, onDelivery: value => deliveries.push(value) });
  return { alerts, platform, prefs, deliveries, played, stopped, decodeLabels, setStored: label => { storedLabel = label; },
    nextDecode: () => decodes.length ? Promise.resolve(decodes.shift()) : new Promise(resolve => waiters.push(resolve)) };
}

test('cancel during custom audio decode prevents late delivery callbacks and allows a fresh send', async () => {
  const f = customSoundFixture();
  const pending = f.alerts.send('Old alert');
  const decode = await f.nextDecode();
  f.alerts.cancel();
  decode.resolve({ label: decode.label, duration: .1 });
  const cancelled = await pending;
  assert.deepEqual(f.played, []);
  assert.deepEqual(f.deliveries, [], 'cancelled work must not overwrite the output status');
  assert.deepEqual(cancelled, { notification: false, vibration: false });
  assert.equal((await f.alerts.send('Fresh alert')).sound, true);
  assert.deepEqual(f.played, ['A']);
  assert.equal(f.deliveries.length, 1);
});

for (const finishOld of ['success', 'failure']) {
  test(`reset ignores stale decode ${finishOld} without replacing the new pending cache`, async () => {
    const f = customSoundFixture();
    const old = f.alerts.send('Old');
    const decodeA = await f.nextDecode();
    f.alerts.resetCustomSound(); f.setStored('B');
    const fresh = f.alerts.send('Fresh');
    const decodeB = await f.nextDecode();
    if (finishOld === 'success') decodeA.resolve({ label: 'A', duration: .1 });
    else decodeA.reject(new Error('Old decode failed'));
    await old;
    assert.deepEqual(f.played, [], 'reset must suppress old playback');
    const shared = f.alerts.send('Share new pending decode');
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(f.decodeLabels, ['A', 'B'], 'stale failure must not clear the new promise');
    decodeB.resolve({ label: 'B', duration: .1 });
    await Promise.all([fresh, shared]);
    await f.alerts.send('Cached');
    assert.deepEqual(f.played, ['B', 'B', 'B']);
  });
}

test('old success after new decode cannot contaminate the replacement buffer', async () => {
  const f = customSoundFixture();
  const old = f.alerts.send('Old'); const a = await f.nextDecode();
  f.alerts.resetCustomSound(); f.setStored('B');
  const fresh = f.alerts.send('Fresh'); const b = await f.nextDecode();
  b.resolve({ label: 'B', duration: .1 }); await fresh;
  a.resolve({ label: 'A', duration: .1 }); await old;
  await f.alerts.send('Cached');
  assert.deepEqual(f.played, ['B', 'B']);
});

test('reset stops active custom repeats and a fresh decode can play', async () => {
  const f = customSoundFixture(); f.prefs.repeatCount = 2;
  const first = f.alerts.send('First'); const a = await f.nextDecode();
  a.resolve({ label: 'A', duration: .1 }); await first;
  f.alerts.resetCustomSound();
  assert.deepEqual(f.stopped, ['A', 'A']);
  f.setStored('B'); const fresh = f.alerts.send('Fresh'); const b = await f.nextDecode();
  b.resolve({ label: 'B', duration: .1 }); await fresh;
  assert.deepEqual(f.played, ['A', 'A', 'B', 'B']);
});

test('mounted alerts invalidate custom sound after successful upload storage event', async () => {
  const f = customSoundFixture(), events = {};
  f.platform.addEventListener = (type, callback) => { events[type] = callback; };
  const elements = Object.fromEntries(Object.entries({ alert: 'sound', alertSound: 'custom', alertVolume: '70' })
    .map(([id, value]) => [id, { value, addEventListener() {} }]));
  const alerts = mountObjectAlerts({ getElementById: id => elements[id], addEventListener() {} }, f.platform, {});
  const first = alerts.send('First'); const a = await f.nextDecode();
  a.resolve({ label: 'A', duration: .1 }); await first;
  f.setStored('B');
  assert.equal(typeof events['custom-sound:saved'], 'function');
  events['custom-sound:saved']();
  const fresh = alerts.send('Fresh'); const b = await f.nextDecode();
  b.resolve({ label: 'B', duration: .1 }); await fresh;
  assert.deepEqual(f.played, ['A', 'B']);
});

test('current decode failure remains retryable after stale failures are guarded', async () => {
  const f = customSoundFixture();
  const first = f.alerts.send('Unreadable'); const a = await f.nextDecode();
  a.reject(new Error('Decode failed')); await first;
  const retry = f.alerts.send('Retry'); const b = await f.nextDecode();
  b.resolve({ label: 'A', duration: .1 });
  assert.equal((await retry).sound, true);
  assert.deepEqual(f.decodeLabels, ['A', 'A']);
  assert.deepEqual(f.played, ['A']);
});

test('custom reset does not cancel pending notification or vibration delivery', async () => {
  const f = fixture(); let resolve;
  f.platform.navigator.serviceWorker.getRegistration = () => new Promise(yes => { resolve = yes; });
  const pending = f.alerts.send('Object ahead');
  f.alerts.resetCustomSound(); resolve(f.registration);
  assert.deepEqual(await pending, { notification: true, vibration: true });
  assert.equal(f.notices.length, 1);
  assert.deepEqual(f.vibrations, []);
});

for (const finishOld of ['success', 'failure']) {
  test(`superseded custom ${finishOld} cannot overwrite a newer successful delivery status`, async () => {
    const f = customSoundFixture();
    const old = f.alerts.send('Old'); const a = await f.nextDecode();
    f.alerts.resetCustomSound(); f.setStored('B');
    const fresh = f.alerts.send('Fresh'); const b = await f.nextDecode();
    b.resolve({ label: 'B', duration: .1 }); await fresh;
    if (finishOld === 'success') a.resolve({ label: 'A', duration: .1 });
    else a.reject(new Error('Superseded decode failed'));
    assert.deepEqual(await old, { notification: false, vibration: false, sound: false });
    assert.deepEqual(f.deliveries, [{ notification: false, vibration: false, sound: true }]);
  });
}

for (const channel of ['notification', 'vibration']) {
  test(`superseded custom decode still reports independent ${channel} delivery`, async () => {
    const f = customSoundFixture();
    if (channel === 'notification') {
      f.prefs.notifications = true;
      f.platform.Notification = class { static permission = 'granted'; };
    } else {
      f.prefs.vibration = true;
      f.platform.navigator = { vibrate: () => true };
    }
    const pending = f.alerts.send('Independent outputs'); const a = await f.nextDecode();
    f.alerts.resetCustomSound(); a.resolve({ label: 'A', duration: .1 });
    const result = await pending;
    assert.equal(result[channel], true);
    assert.equal(result.sound, false);
    assert.deepEqual(f.deliveries, [result]);
    assert.deepEqual(f.played, []);
  });
}
