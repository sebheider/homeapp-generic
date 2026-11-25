import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HEATPUMP_IDLE_W, heatPumpRunning, heatPumpState, heatPumpWatts } from '../src/lib/heatpump.ts';

const hp = (states, options = {}) => ({ states, options });

test('the compressor runs for a switch that is on or a speed above 0', () => {
  const d = hp({ compressor: 'alias.0.Waermepumpe.Heizung.Drehzahl-Verdichter' });
  for (const on of [true, 1, '1', 'true', 'on', 2400, '2400', 37.5]) assert.equal(heatPumpRunning(d, { compressor: on }), true, String(on));
  for (const off of [false, 0, '0', 'false', 'off', '', null, undefined, -1]) assert.equal(heatPumpRunning(d, { compressor: off }), false, String(off));
});

test('with a compressor datapoint the power draw does not decide; without it a noticeable draw counts', () => {
  const both = hp({ compressor: 'c', electricPower: 'p' });
  assert.equal(heatPumpRunning(both, { compressor: 0, electricPower: 900 }), false);
  const powerOnly = hp({ electricPower: 'p' });
  assert.equal(heatPumpRunning(powerOnly, { electricPower: HEATPUMP_IDLE_W + 1 }), true);
  assert.equal(heatPumpRunning(powerOnly, { electricPower: HEATPUMP_IDLE_W }), false);
  assert.equal(heatPumpRunning(hp({ electricPower: 'p' }, { powerUnit: 'kW' }), { electricPower: 0.8 }), true, '0.8 kW = 800 W');
  assert.equal(heatPumpRunning(hp({}), {}), false);
});

test('power datapoints are converted to W according to the option "powerUnit"', () => {
  assert.equal(heatPumpWatts(hp({}), 780), 780);
  assert.equal(heatPumpWatts(hp({}, { powerUnit: 'W' }), '780'), 780);
  assert.equal(heatPumpWatts(hp({}, { powerUnit: 'kW' }), 1.25), 1250);
  assert.equal(heatPumpWatts(hp({}, { powerUnit: 'kW' }), '0,5'), null, 'not a number');
  assert.equal(heatPumpWatts(hp({}), null), null);
  assert.equal(heatPumpWatts(hp({}), ''), null);
});

test('operating state: running, ready or off (without an on/off datapoint: ready)', () => {
  assert.equal(heatPumpState(hp({ power: 'x' }), { power: true }, true), 'Verdichter läuft');
  assert.equal(heatPumpState(hp({ power: 'x' }), { power: true }, false), 'Bereit');
  assert.equal(heatPumpState(hp({ power: 'x' }), { power: false }, false), 'Aus');
  assert.equal(heatPumpState(hp({}), {}, false), 'Bereit');
});
