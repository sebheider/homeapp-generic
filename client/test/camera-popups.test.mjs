import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAMERA_POPUP_PAUSE_MINUTES, loadCameraPopupPause, saveCameraPopupPause, shouldShowCameraPopup } from '../src/lib/cameraPopups.ts';

const event = (kind = 'motion', popup = true) => ({
  cameraId: '1', name: 'Eingang', ts: 1000, source: 'Webhook', kind, reason: null, popup,
});

function storage(t) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  });
  return values;
}

test('all offered durations are finite and cover short and long visits', () => {
  assert.deepEqual(CAMERA_POPUP_PAUSE_MINUTES, [15, 30, 60, 120, 240, 480]);
});

test('motion and people popups from every camera are suppressed until the exact deadline', () => {
  for (const kind of ['motion', 'people']) {
    for (const cameraId of ['1', '2']) {
      const incoming = { ...event(kind), cameraId };
      assert.equal(shouldShowCameraPopup(incoming, null, 2000, 1999), false);
      assert.equal(shouldShowCameraPopup(incoming, null, 2000, 2000), true);
      assert.equal(shouldShowCameraPopup(incoming, null, 2000, 2001), true);
      assert.equal(shouldShowCameraPopup(incoming, null, 0, 1500), true);
    }
  }
});

test('expiry still respects server rules and the priority of a running people popup', () => {
  assert.equal(shouldShowCameraPopup(event('motion', false), null, 2000, 2000), false);
  assert.equal(shouldShowCameraPopup(event('people', false), null, 0, 2000), false);
  assert.equal(shouldShowCameraPopup(event(), event('people'), 2000, 2000), false);
  assert.equal(shouldShowCameraPopup(event('people'), event(), 2000, 2000), true);
  assert.equal(shouldShowCameraPopup(event('people'), event('people'), 0, 2000), true);
  assert.equal(shouldShowCameraPopup(event(), event(), 0, 2000), true);
});

test('suppression does not mutate the incoming event or its history flag', () => {
  const incoming = Object.freeze(event());
  assert.equal(shouldShowCameraPopup(incoming, null, 2000, 1000), false);
  assert.equal(incoming.popup, true);
  assert.equal(incoming.ts, 1000);
});

test('a saved pause survives reload, expires automatically and can be ended early', (t) => {
  const values = storage(t);
  assert.equal(loadCameraPopupPause(1000), 0);
  saveCameraPopupPause(2000);
  assert.equal(loadCameraPopupPause(1000), 2000);
  assert.equal(loadCameraPopupPause(2000), 0);
  assert.equal(loadCameraPopupPause(3000), 0);
  saveCameraPopupPause(4000);
  saveCameraPopupPause(0);
  assert.equal(loadCameraPopupPause(1000), 0);
  assert.equal(values.size, 0);
});

test('invalid, expired or missing stored values cannot disable popups permanently', (t) => {
  const values = storage(t);
  for (const raw of ['', 'null', '{}', 'broken', 'Infinity', 'NaN', '-1', '0', '999', '1000', '2000.5', '8640000000000001']) {
    values.set('cameraPopupsSuppressedUntil', raw);
    assert.equal(loadCameraPopupPause(1000), 0, raw);
  }
});

test('unavailable browser storage does not break loading, pausing or resuming', (t) => {
  storage(t);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { throw new Error('Storage unavailable'); },
  });
  assert.equal(loadCameraPopupPause(1000), 0);
  assert.doesNotThrow(() => saveCameraPopupPause(2000));
  assert.doesNotThrow(() => saveCameraPopupPause(0));
});

test('cameras stay on the overview for their pop-up time plus the hold time', async () => {
  const { recentMotionCameras } = await import('../src/lib/cameraPopups.ts');
  const seconds = { motion: 30, people: 60 };
  const at = (cameraId, ts, kind = 'motion', popup = true) => ({ ...event(kind, popup), cameraId, ts });
  const now = 1_000_000;
  const events = [at('2', now - 10_000), at('1', now - 20_000), at('1', now - 100_000, 'people'), at('3', now - 300_000), at('4', now - 5_000, 'motion', false)];
  const list = recentMotionCameras(events, seconds, now, 180);
  assert.deepEqual(list.map((e) => e.cameraId), ['2', '1']);
  assert.equal(list[1].kind, 'people');
  assert.equal(list[1].ts, now - 20_000);
  // motion: 30 s pop-up + 180 s hold
  assert.equal(recentMotionCameras([at('1', now - 209_000)], seconds, now, 180).length, 1);
  assert.equal(recentMotionCameras([at('1', now - 210_000)], seconds, now, 180).length, 0);
  assert.equal(recentMotionCameras([at('1', now - 239_000, 'people')], seconds, now, 180).length, 1);
});
