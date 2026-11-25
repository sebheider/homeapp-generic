import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MOWER_STATE, appendTail, areaText, gridStep, headingDeg, mapBounds, mapRotation, mowerActivity, mowerStatus, parseFrame, parsePoint, parseTrack,
  pathOf, projection, rotateBounds, rotatePoint, suggestedCommands, unwrapDeg,
} from '../src/lib/mower.ts';

test('state texts of the navimow adapter (vehicleState and state) map to activities', () => {
  assert.equal(mowerActivity('isRunning'), 'mowing');
  assert.equal(mowerActivity('isDocking'), 'returning');
  assert.equal(mowerActivity('isIdel'), 'idle', 'the cloud misspells idle');
  assert.equal(mowerActivity('Self-checking'), 'selftest');
  assert.equal(mowerActivity('inSoftwareUpdate'), 'update');
  assert.equal(mowerActivity('charging'), 'charging');
  assert.equal(mowerActivity('isLifted'), 'lifted');
  assert.equal(mowerActivity(undefined), 'unknown');
  assert.equal(mowerStatus('isRunning').label, 'Mäht');
  assert.equal(mowerStatus('isTurbo').label, 'isTurbo', 'unknown texts are shown as they are');
  assert.equal(mowerStatus(null).label, MOWER_STATE.unknown.label);
  assert.equal(MOWER_STATE.lifted.problem, true);
});

test('suggested commands follow the activity, nothing is suggested in an error', () => {
  assert.deepEqual(suggestedCommands('mowing'), ['pause', 'home']);
  assert.deepEqual(suggestedCommands('paused'), ['resume', 'home']);
  assert.deepEqual(suggestedCommands('docked'), ['start']);
  assert.deepEqual(suggestedCommands('error'), []);
});

test('track, frame and station from the adapter JSON', () => {
  const track = parseTrack('{"percentage":88,"area":75.85,"progressAt":1,"points":[[3,-14.25,2.39],[2.75,-14],["x",1],[0.75,-11,-2.6]]}');
  assert.deepEqual(track, { points: [{ x: 3, y: -14.25, h: 2.39 }, { x: 2.75, y: -14 }, { x: 0.75, y: -11, h: -2.6 }], percentage: 88, area: 75.85 });
  assert.equal(parseTrack('kaputt'), null);
  assert.equal(parseTrack(''), null);
  assert.deepEqual(parseTrack([[1, 2]])?.points, [{ x: 1, y: 2 }]);
  assert.deepEqual(parseFrame('{"minX":-2,"maxX":5,"minY":-17,"maxY":-9,"width":700,"height":800,"scale":100}'), { minX: -2, maxX: 5, minY: -17, maxY: -9 });
  assert.equal(parseFrame('{"minX":1,"maxX":1,"minY":0,"maxY":2}'), null);
  assert.deepEqual(parsePoint('{"x":4.5,"y":-12}'), { x: 4.5, y: -12 });
  assert.equal(parsePoint(''), null);
  assert.equal(parsePoint(null), null);
});

test('rotation turns points, headings and bounds clockwise', () => {
  assert.equal(mapRotation('90'), 90);
  assert.equal(mapRotation('45'), 0);
  assert.deepEqual(rotatePoint({ x: 1, y: 0, h: 0 }, 90), { x: 0, y: -1, h: -Math.PI / 2 });
  assert.deepEqual(rotatePoint({ x: 1, y: 2 }, 180), { x: -1, y: -2 });
  assert.deepEqual(rotatePoint({ x: 1, y: 2 }, 270), { x: -2, y: 1 });
  assert.deepEqual(rotateBounds({ minX: -2, maxX: 5, minY: -17, maxY: -9 }, 90), { minX: -17, maxX: -9, minY: -5, maxY: 2 });
});

test('map bounds: frame grown by the live position, minimum size without a frame', () => {
  const frame = { minX: -2, maxX: 5, minY: -17, maxY: -9 };
  assert.deepEqual(mapBounds(frame, [{ x: 0, y: -10 }]), frame);
  assert.deepEqual(mapBounds(frame, [{ x: 6, y: -10 }]), { minX: -2, maxX: 6.6, minY: -17, maxY: -9 });
  assert.deepEqual(mapBounds(null, [{ x: 0, y: 0 }]), { minX: -2, maxX: 2, minY: -2, maxY: 2 });
  assert.equal(mapBounds(null, []), null);
});

test('projection: the longer side spans 1000 units, y points down', () => {
  const p = projection({ minX: -2, maxX: 5, minY: -17, maxY: -9 });
  assert.equal(p.scale, 125);
  assert.equal(p.width, 875);
  assert.equal(p.height, 1000);
  assert.deepEqual(p.at({ x: -2, y: -9 }), [0, 0]);
  assert.deepEqual(p.at({ x: 5, y: -17 }), [875, 1000]);
  assert.equal(pathOf([{ x: -2, y: -9 }, { x: 0, y: -10 }], p.at), 'M0.0 0.0L250.0 125.0');
  assert.equal(gridStep(8), 1);
  assert.equal(gridStep(20), 2);
  assert.equal(gridStep(60), 5);
});

test('heading and the shortest turn of the mower symbol', () => {
  assert.equal(headingDeg(Math.PI / 2), -90, 'heading north points up on the map');
  assert.equal(unwrapDeg(170, -170), 190);
  assert.equal(unwrapDeg(-170, 170), -190);
  assert.equal(unwrapDeg(10, 20), 20);
  assert.equal(unwrapDeg(350, 0), 360);
});

test('live tail: ignores jitter, keeps the newest positions', () => {
  let tail = appendTail([], { x: 0, y: 0 });
  assert.equal(appendTail(tail, { x: 0.01, y: 0 }), tail);
  tail = appendTail(tail, { x: 1, y: 0 });
  assert.equal(tail.length, 2);
  const capped = appendTail(tail, { x: 2, y: 0 }, 0.05, 2);
  assert.deepEqual(capped, [{ x: 1, y: 0 }, { x: 2, y: 0 }]);
});

test('area text', () => {
  assert.equal(areaText(75.85), '75,9 m²');
  assert.equal(areaText(163.16), '163 m²');
  assert.equal(areaText(null), '–');
});
