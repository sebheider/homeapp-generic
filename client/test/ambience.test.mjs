import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FROST_COLOR, HEAT_COLOR, daypart, particles, precipitation, sunMood, temperatureLook } from '../src/lib/ambience.ts';

const at = (h, m = 0) => new Date(2026, 5, 21, h, m);
const sec = (d) => d.getTime() / 1000;

test('daypart: by the sun times of the weather', () => {
  const sunrise = sec(at(5, 0));
  const sunset = sec(at(21, 30));
  assert.equal(daypart(at(4, 0), sunrise, sunset), 'night');
  assert.equal(daypart(at(4, 30), sunrise, sunset), 'dawn');
  assert.equal(daypart(at(6, 0), sunrise, sunset), 'dawn');
  assert.equal(daypart(at(6, 30), sunrise, sunset), 'day');
  assert.equal(daypart(at(20, 0), sunrise, sunset), 'day');
  assert.equal(daypart(at(20, 30), sunrise, sunset), 'dusk');
  assert.equal(daypart(at(22, 0), sunrise, sunset), 'dusk');
  assert.equal(daypart(at(22, 30), sunrise, sunset), 'night');
});

test('daypart: fixed hours without (valid) sun times', () => {
  assert.equal(daypart(at(7)), 'dawn');
  assert.equal(daypart(at(12)), 'day');
  assert.equal(daypart(at(19)), 'dusk');
  assert.equal(daypart(at(23)), 'night');
  assert.equal(daypart(at(12), null, null), 'day');
  assert.equal(daypart(at(12), sec(at(20)), sec(at(6))), 'day');
});

test('hero weather: rain, snow, thunder, fog or no effect', () => {
  assert.equal(precipitation('rain'), 'rain');
  assert.equal(precipitation('drizzle'), 'rain');
  assert.equal(precipitation('thunder'), 'thunder');
  assert.equal(precipitation('snow'), 'snow');
  assert.equal(precipitation('fog'), 'fog');
  assert.equal(precipitation('clear'), null);
  assert.equal(precipitation('partly'), null);
  assert.equal(precipitation('cloudy'), null);
  assert.equal(precipitation(undefined), null);
});

test('particles: deterministic, spread across the width', () => {
  const a = particles(20, 'rain');
  assert.deepEqual(a, particles(20, 'rain'));
  assert.equal(a.length, 20);
  for (const p of a) {
    assert.ok(p.left >= -2 && p.left <= 102, `left ${p.left}`);
    assert.ok(p.delay <= 0);
    assert.ok(p.duration > 0);
  }
  assert.ok(a[0].left < a[19].left);
  assert.ok(particles(10, 'snow')[0].duration > a[0].duration);
});

test('temperature look: frost below 0 °C, heat from 30 °C, a colour along the scale in between', () => {
  assert.deepEqual(temperatureLook(-0.1), { kind: 'frost', color: FROST_COLOR });
  assert.deepEqual(temperatureLook(-25), { kind: 'frost', color: FROST_COLOR });
  assert.deepEqual(temperatureLook(30), { kind: 'heat', color: HEAT_COLOR });
  assert.deepEqual(temperatureLook(41.5), { kind: 'heat', color: HEAT_COLOR });
  // exact stops and an interpolated value
  assert.deepEqual(temperatureLook(0), { kind: 'mild', color: '#60a5fa' });
  assert.deepEqual(temperatureLook(8), { kind: 'mild', color: '#22d3ee' });
  assert.deepEqual(temperatureLook(29.99).kind, 'mild');
  assert.equal(temperatureLook(4).color, '#41bcf4');
  // the hue moves steadily from blue towards red across the mild range
  const hue = (t) => {
    const [r, g, b] = temperatureLook(t).color.match(/[0-9a-f]{2}/g).map((h) => parseInt(h, 16) / 255);
    const max = Math.max(r, g, b);
    const d = max - Math.min(r, g, b);
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  };
  for (let t = 0; t < 29.5; t += 0.5) {
    assert.ok(hue(t + 0.5) <= hue(t) + 0.01, `hue falls at ${t} °C`);
  }
  assert.ok(hue(0) > 200 && hue(29.9) < 30);
  // unknown values fall back to a mild colour instead of failing
  assert.equal(temperatureLook(Number.NaN).kind, 'mild');
});

test('sun mood: freezing from -5 °C downwards, sweating from 30 °C, mild in between or without a value', () => {
  assert.equal(sunMood(-5), 'frost');
  assert.equal(sunMood(-12.4), 'frost');
  assert.equal(sunMood(-4.9), 'mild');
  assert.equal(sunMood(-1), 'mild');
  assert.equal(sunMood(29.9), 'mild');
  assert.equal(sunMood(30), 'heat');
  assert.equal(sunMood(null), 'mild');
  assert.equal(sunMood(undefined), 'mild');
  assert.equal(sunMood(Number.NaN), 'mild');
});
