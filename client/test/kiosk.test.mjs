import { test } from 'node:test';
import assert from 'node:assert/strict';
import { co2Limits, co2Status, kioskValue } from '../src/lib/kiosk.ts';

test('CO2 traffic light uses the ventilation defaults (1000 / 1400 ppm)', () => {
  for (const [value, level] of [[400, 'green'], [999, 'green'], [1000, 'yellow'], [1399, 'yellow'], [1400, 'red'], [40000, 'red']]) {
    assert.equal(co2Status(value).level, level, `${value} ppm`);
  }
  assert.equal(co2Status(800).color, '#34d399');
  assert.equal(co2Status(1000).color, '#fbbf24');
  assert.equal(co2Status(1400).color, '#f43f5e');
});

test('CO2 traffic light follows the configured ventilation thresholds', () => {
  const limits = co2Limits({ co2Max: 800, co2Warn: 1200 });
  assert.deepEqual(limits, { yellow: 800, red: 1200 });
  for (const [value, level] of [[799, 'green'], [800, 'yellow'], [1199, 'yellow'], [1200, 'red']]) {
    assert.equal(co2Status(value, limits).level, level, `${value} ppm`);
  }
  // the server warns only once airing is recommended: red never starts below yellow
  assert.deepEqual(co2Limits({ co2Max: 1200, co2Warn: 900 }), { yellow: 1200, red: 1200 });
  assert.deepEqual(co2Limits(null), { yellow: 1000, red: 1400 });
});

test('missing and invalid CO2 must not look healthy', () => {
  for (const value of [null, 0, -1, NaN, Infinity, -Infinity]) {
    assert.equal(co2Status(value).level, null);
    assert.equal(co2Status(value).label, 'Keine Messwerte');
  }
});

test('latest sensor report preserves zero lux / humidity and negative temperatures', () => {
  const agent = { values: { co2: 850, lux: 0, humidity: 0, temperature: -5.2, presence: false } };
  assert.equal(kioskValue(agent, 'co2'), 850);
  assert.equal(kioskValue(agent, 'lux'), 0);
  assert.equal(kioskValue(agent, 'humidity'), 0);
  assert.equal(kioskValue(agent, 'temperature'), -5.2);
  assert.equal(kioskValue(agent, 'presence'), null);
});

test('absent or invalid sensors have no numeric value, including CO2 zero at startup', () => {
  assert.equal(kioskValue(undefined, 'co2'), null);
  assert.equal(kioskValue({ values: {} }, 'co2'), null);
  for (const co2 of [0, -1, NaN, Infinity, '800', true]) {
    assert.equal(kioskValue({ values: { co2 } }, 'co2'), null);
  }
});
