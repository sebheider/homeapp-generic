// Motion hub: cooldown per camera and kind, pop-up decision, rising edges of ioBroker datapoints.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MotionHub, normalizeKind } from '../src/motion.js';
import { kindPopupAllowed } from '../src/popup-rules.js';

const config = (app = {}, cameras = []) => ({
  app: { motionPopup: true, peoplePopup: true, popupRules: [], ...app },
  surveillance: { motionCooldownSeconds: 60 },
  cameras,
});

const hub = (cfg) => {
  const h = new MotionHub(() => cfg, (id) => (String(id) === '1' ? 'Eingang' : undefined));
  const events = [];
  h.on('motion', (e) => events.push(e));
  return { h, events };
};

test('normalizeKind maps free text to motion / people', () => {
  assert.equal(normalizeKind('Person'), 'people');
  assert.equal(normalizeKind('erweitert'), 'people');
  assert.equal(normalizeKind(undefined), 'motion');
  assert.equal(normalizeKind('bewegung'), 'motion');
});

test('cooldown is kept per camera and kind', () => {
  const { h, events } = hub(config());
  assert.equal(h.trigger({ cameraId: 1, source: 'Test' }), true);
  assert.equal(h.trigger({ cameraId: 1, source: 'Test' }), false, 'same camera and kind within cooldown');
  assert.equal(h.trigger({ cameraId: 1, source: 'Test', kind: 'people' }), true, 'people is not blocked by motion');
  assert.equal(h.trigger({ cameraId: 2, source: 'Test' }), true);
  assert.equal(events.length, 3);
  assert.equal(events[0].name, 'Eingang');
  assert.equal(events[2].name, 'Kamera 2');
  assert.deepEqual(h.recent.map((e) => e.cameraId), ['2', '1', '1'], 'newest first');
});

test('recent motion history covers the six-hour activity timeline', () => {
  const originalNow = Date.now;
  let now = 1_700_000_000_000;
  Date.now = () => now;
  try {
    const { h } = hub(config());
    for (let i = 0; i < 31; i++) h.trigger({ cameraId: String(i), source: 'Test' });
    assert.equal(h.recent.length, 31, 'keep more than the previous 30-event limit');

    now += 6 * 60 * 60 * 1000 + 1;
    h.trigger({ cameraId: 'new', source: 'Test' });
    assert.deepEqual(h.recent.map((e) => e.cameraId), ['new'], 'discard events outside the timeline');
  } finally {
    Date.now = originalNow;
  }
});

test('pop-up flag combines global, schedule and per-camera switches; hidden cameras are ignored', () => {
  const { h, events } = hub(config({ peoplePopup: false }, [{ id: '1', popupMotion: false }, { id: '2', hidden: true }, { id: '3', popup: false }]));
  h.trigger({ cameraId: '1', source: 'T', kind: 'motion' });
  h.trigger({ cameraId: '4', source: 'T', kind: 'people' });
  h.trigger({ cameraId: '4', source: 'T', kind: 'motion' });
  h.trigger({ cameraId: '3', source: 'T', kind: 'motion' });
  assert.equal(h.trigger({ cameraId: '2', source: 'T' }), false);
  assert.deepEqual(events.map((e) => [e.cameraId, e.kind, e.popup]), [
    ['1', 'motion', false],
    ['4', 'people', false],
    ['4', 'motion', true],
    ['3', 'motion', false],
  ]);
});

test('kindPopupAllowed respects the global switch of the kind', () => {
  assert.equal(kindPopupAllowed({ motionPopup: false }, 'motion', '1'), false);
  assert.equal(kindPopupAllowed({ motionPopup: false }, 'people', '1'), true);
  assert.equal(kindPopupAllowed(undefined, 'people', '1'), true);
});

test('ioBroker datapoints fire only on a rising edge', () => {
  const { h, events } = hub(config({}, [{ id: '5', motionState: 'm.5', peopleState: 'p.5' }]));
  h.onState('m.5', { val: true }); // first value after connecting: no event
  h.onState('m.5', { val: false });
  h.onState('m.5', { val: 1 });
  h.onState('m.5', { val: true }); // still on: no new event
  h.onState('p.5', { val: 'false' });
  h.onState('p.5', { val: 'true' });
  assert.deepEqual(events.map((e) => [e.cameraId, e.kind, e.source]), [
    ['5', 'motion', 'ioBroker'],
    ['5', 'people', 'ioBroker'],
  ]);
});
