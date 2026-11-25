import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moonAppearance, moonPhase } from '../src/lib/moon.ts';

test('moon phase cycles from new moon through full moon', () => {
  const newMoon = Date.UTC(2000, 0, 6, 18, 14);
  const synodicMonth = 29.530588853 * 24 * 60 * 60 * 1000;

  assert.ok(moonPhase(newMoon) < 0.001);
  assert.ok(Math.abs(moonPhase(newMoon + synodicMonth / 2) - 0.5) < 0.001);
  const nextNewMoon = moonPhase(newMoon + synodicMonth);
  assert.ok(Math.min(nextNewMoon, 1 - nextNewMoon) < 0.001);
});

test('illumination follows the observed lunar phases in April and May 2024', () => {
  const at = (date) => moonAppearance(Date.parse(date), 52.52, 13.405).illuminated;
  assert.ok(at('2024-04-08T18:21:00Z') < 0.005);
  assert.ok(Math.abs(at('2024-04-15T19:13:00Z') - 0.5) < 0.03);
  assert.ok(at('2024-04-23T23:49:00Z') > 0.995);
  assert.ok(Math.abs(at('2024-05-01T11:27:00Z') - 0.5) < 0.03);
});

test('the illuminated side and horizon orientation change with time and location', () => {
  const time = Date.parse('2024-04-15T19:00:00Z');
  const berlin = moonAppearance(time, 52.52, 13.405);
  const sydney = moonAppearance(time, -33.87, 151.21);
  const later = moonAppearance(time + 3 * 3600000, 52.52, 13.405);
  const lastQuarter = moonAppearance(Date.parse('2024-05-01T11:27:00Z'), 52.52, 13.405);
  assert.ok(berlin.brightLimbAngle < 0);
  assert.ok(lastQuarter.brightLimbAngle > 0);
  assert.ok(Math.abs(berlin.parallacticAngle - sydney.parallacticAngle) > 0.5);
  assert.ok(Math.abs(berlin.parallacticAngle - later.parallacticAngle) > 0.1);
});

test('missing or invalid coordinates use a finite celestial-north orientation', () => {
  const time = Date.parse('2024-04-15T19:00:00Z');
  const noLocation = moonAppearance(time);
  assert.equal(noLocation.parallacticAngle, 0);
  assert.ok(Number.isFinite(noLocation.brightLimbAngle));
  assert.deepEqual(moonAppearance(time, 100, 13), noLocation);
  assert.deepEqual(moonAppearance(time, 52, null), noLocation);
});
