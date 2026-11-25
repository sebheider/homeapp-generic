import { test } from 'node:test';
import assert from 'node:assert/strict';
import { glowLevel, runningIconClass, weatherExtras, WINDY_KMH } from '../src/lib/iconFx.ts';

test('runningIconClass: known icons move, others only glow', () => {
  assert.equal(runningIconClass('fan'), 'anim-spin');
  assert.equal(runningIconClass('washing'), 'anim-wobble');
  assert.equal(runningIconClass('flame'), 'anim-flicker');
  assert.equal(runningIconClass('plug'), 'anim-zap');
  assert.equal(runningIconClass('tv'), '');
  assert.equal(runningIconClass(undefined), '');
  assert.equal(runningIconClass(null), '');
});

test('glowLevel: follows the brightness with a visible minimum', () => {
  assert.equal(glowLevel(null), 1);
  assert.equal(glowLevel(undefined), 1);
  assert.equal(glowLevel(Number.NaN), 1);
  assert.equal(glowLevel(100), 1);
  assert.equal(glowLevel(140), 1);
  assert.equal(glowLevel(50), 0.5);
  assert.equal(glowLevel(3), 0.15);
  assert.equal(glowLevel(0), 0.15);
});

test('weatherExtras: details from the WMO code', () => {
  assert.equal(weatherExtras(81).showers, true);
  assert.equal(weatherExtras(85).showers, true);
  assert.equal(weatherExtras(63).showers, false);
  assert.equal(weatherExtras(65).heavy, true);
  assert.equal(weatherExtras(61).heavy, false);
  assert.equal(weatherExtras(66).freezing, true);
  assert.equal(weatherExtras(57).freezing, true);
  assert.equal(weatherExtras(99).hail, true);
  assert.equal(weatherExtras(95).hail, false);
  assert.deepEqual(weatherExtras(undefined), { showers: false, heavy: false, freezing: false, hail: false, windy: false });
});

test('weatherExtras: gusts from the threshold on', () => {
  assert.equal(weatherExtras(0, WINDY_KMH).windy, true);
  assert.equal(weatherExtras(0, WINDY_KMH - 1).windy, false);
  assert.equal(weatherExtras(0, null).windy, false);
});
