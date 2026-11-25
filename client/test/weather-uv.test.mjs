import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uvOutlook } from '../src/lib/uv.ts';

const H = 3600;
const day0 = 1_800_000_000 - (1_800_000_000 % 86400);
/** Hourly UV values from `start` (seconds) on. */
const hours = (start, values) => values.map((uv, i) => ({ t: start + i * H, temp: null, pop: null, precip: null, code: null, uv, isDay: uv > 0 }));
const web = (nowUv, hourly) => ({
  configured: true,
  timezone: 'UTC',
  fetchedAt: 0,
  current: { uv: nowUv },
  hourly,
  daily: [
    { t: day0, sunrise: day0 + 6 * H, sunset: day0 + 20 * H },
    { t: day0 + 86400, sunrise: day0 + 86400 + 6 * H, sunset: day0 + 86400 + 20 * H },
  ],
  nowcast: [],
});

test('UV outlook: the coming sunny hours and their peak, night hours left out', () => {
  const w = web(4, hours(day0 + 14 * H, [4, 5, 3, 1, 0.2, 0, 0, 0]));
  const o = uvOutlook(w, day0 + 14 * H + 600);
  assert.equal(o.now, 4);
  assert.equal(o.tomorrow, false);
  assert.deepEqual(o.shown.map((h) => h.uv), [4, 5, 3, 1]);
  assert.equal(o.peak.uv, 5);
});

test('UV outlook after sunset: the sunny hours of tomorrow', () => {
  const tonight = hours(day0 + 21 * H, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const tomorrow = hours(day0 + 86400 + 5 * H, [0, 0.4, 1, 3, 6, 7, 6, 3, 1, 0.3, 0]);
  const o = uvOutlook(web(0, [...tonight, ...tomorrow]), day0 + 21 * H + 600);
  assert.equal(o.tomorrow, true);
  assert.deepEqual(o.shown.map((h) => h.uv), [1, 3, 6, 7, 6, 3, 1]);
  assert.equal(o.peak.uv, 7);
});

test('UV outlook needs a current UV value', () => {
  assert.equal(uvOutlook(null, 0), null);
  assert.equal(uvOutlook(web(null, []), 0), null);
  assert.deepEqual(uvOutlook(web(0, hours(day0, [0, 0])), day0).shown, []);
});
