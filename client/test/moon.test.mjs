import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moonAppearance, moonLitPath, moonPhase } from '../src/lib/moon.ts';

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

test('the lit side reaches beyond the limb and bulges right for a crescent, left for a gibbous moon', () => {
  assert.equal(moonLitPath(0, 0, 10, 0.25), 'M0 -10A5 10 0 0 1 0 10V20H20V-20H0Z');
  assert.equal(moonLitPath(0, 0, 10, 0.75), 'M0 -10A5 10 0 0 0 0 10V20H20V-20H0Z');
});

// Topocentric reference values from JPL Horizons (Illu%, SN.ang, NP.ang, hour angle and declination)
const HORIZONS = [
  { time: '2024-04-15T19:00:00Z', lat: 52.52, lon: 13.405, illu: 49.9201, limb: 281.15, axis: 10.8563, hourAngle: 1.586869, dec: 25.57707 },
  { time: '2024-04-15T22:00:00Z', lat: 52.52, lon: 13.405, illu: 50.93702, limb: 281.71, axis: 11.2954, hourAngle: 4.505198, dec: 25.1084 },
  { time: '2024-05-01T03:00:00Z', lat: 52.52, lon: 13.405, illu: 53.99914, limb: 75.32, axis: 345.4361, hourAngle: -2.188133, dec: -24.22813 },
  { time: '2026-11-25T17:00:00Z', lat: 52.52, lon: 13.405, illu: 98.00587, limb: 72.39, axis: 354.631, hourAngle: -6.997666, dec: 26.71697 },
  { time: '2024-04-15T09:00:00Z', lat: -33.87, lon: 151.21, illu: 45.58807, limb: 278.57, axis: 8.9566, hourAngle: 1.124845, dec: 27.79808 },
  { time: '2024-05-01T20:00:00Z', lat: -33.87, lon: 151.21, illu: 45.93174, limb: 71.69, axis: 342.8632, hourAngle: -0.608409, dec: -19.91292 },
];
const RAD = Math.PI / 180;
const angleDiff = (radians, degrees) => Math.abs(((radians / RAD - degrees) % 360 + 540) % 360 - 180);

test('phase, bright limb, lunar axis and horizon orientation match JPL Horizons', () => {
  for (const ref of HORIZONS) {
    const moon = moonAppearance(Date.parse(ref.time), ref.lat, ref.lon);
    const hourAngle = ref.hourAngle * 15 * RAD;
    const dec = ref.dec * RAD;
    const parallactic = Math.atan2(Math.sin(hourAngle), Math.tan(ref.lat * RAD) * Math.cos(dec) - Math.sin(dec) * Math.cos(hourAngle));
    assert.ok(Math.abs(moon.illuminated * 100 - ref.illu) < 0.8, `${ref.time} illumination`);
    assert.ok(angleDiff(moon.brightLimbAngle, ref.limb) < 0.5, `${ref.time} bright limb`);
    assert.ok(angleDiff(moon.axisAngle, ref.axis) < 1, `${ref.time} lunar axis`);
    // near the zenith the parallactic angle amplifies small position errors
    assert.ok(angleDiff(moon.parallacticAngle, parallactic / RAD) < 1.5, `${ref.time} parallactic angle`);
  }
});
