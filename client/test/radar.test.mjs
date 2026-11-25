import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addTrail, arcPath, meters, metersShort, polar, radarAgentIds, radarRange, reportFrame, ringStep, sectorPath } from '../src/lib/radar.ts';

const frame = (over = {}) => ({ mode: 'basic', presence: true, moving: null, still: null, gates: null, gateCm: 75, error: null, ...over });

test('radar agents are the kiosk agents that reported presence or a distance', () => {
  const states = {
    'homeapp.kiosk.flur.presence': { val: true },
    'homeapp.kiosk.flur.co2': { val: 600 },
    'homeapp.kiosk.kueche.co2': { val: 700 },
    'homeapp.kiosk.bad.distance': { val: 120 },
    'hm-rpc.0.presence': { val: true },
  };
  assert.deepEqual(radarAgentIds(states), ['bad', 'flur']);
  assert.deepEqual(radarAgentIds({}), []);
});

test('report frame: the reported distance for the reported kinds, the OUT pin without distance', () => {
  const f = reportFrame({ presence: true, moving: true, still: false, distance: 140 });
  assert.equal(f.mode, 'report');
  assert.deepEqual(f.moving, { distance: 140, energy: null });
  assert.equal(f.still, null);
  // a target beyond the limit is reported, but it is no presence
  assert.equal(reportFrame({ presence: false, moving: false, still: false, distance: 420 }).moving, null);
  const pin = reportFrame({ presence: true });
  assert.equal(pin.mode, 'pin');
  assert.equal(pin.moving, null);
  assert.equal(reportFrame({}).presence, null);
});

test('the range covers all distance gates, the presence limit and every target', () => {
  assert.equal(radarRange(frame()), 700); // 9 gates × 75 cm
  assert.equal(radarRange(frame({ gates: { moving: new Array(9).fill(0), still: [] }, gateCm: 20 })), 200); // fine resolution
  assert.equal(radarRange(frame(), 800), 800);
  assert.equal(radarRange(frame({ moving: { distance: 735, energy: 40 } })), 800);
  assert.equal(ringStep(200), 50);
  assert.equal(ringStep(700), 100);
});

test('geometry: the field of view spans ±60° above the sensor', () => {
  const [x, y] = polar(100, 100, 50, 1, 0);
  assert.deepEqual([x, y], [100, 50]);
  const [xr, yr] = polar(100, 100, 50, 1, 90);
  assert.ok(Math.abs(xr - 150) < 1e-9 && Math.abs(yr - 100) < 1e-9);
  assert.equal(arcPath(100, 100, 50, 1), 'M56.7 75A50 50 0 0 1 143.3 75');
  assert.equal(sectorPath(100, 100, 50, 0, 1), 'M56.7 75A50 50 0 0 1 143.3 75L100 100Z');
  assert.match(sectorPath(100, 100, 50, 0.5, 1), /^M56\.7 75A50 50 0 0 1 143\.3 75L121\.65 87\.5A25 25 0 0 0 78\.35 87\.5Z$/);
});

test('labels and afterglow', () => {
  assert.equal(meters(135), '1,35 m');
  assert.equal(meters(300, 0), '3 m');
  assert.equal(metersShort(75), '0,75');
  assert.equal(metersShort(150), '1,5');
  assert.equal(metersShort(0), '0');
  let trail = [];
  trail = addTrail(trail, 1000, frame({ moving: { distance: 200, energy: 50 } }));
  trail = addTrail(trail, 1250, frame({ still: { distance: 90, energy: 60 } }));
  assert.deepEqual(trail, [{ at: 1000, moving: 200, still: null }, { at: 1250, moving: null, still: 90 }]);
  trail = addTrail(trail, 4000, frame());
  assert.deepEqual(trail.map((p) => p.at), [4000]);
});
