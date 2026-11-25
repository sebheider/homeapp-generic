import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daypart, particles, precipitation } from '../src/lib/ambience.ts';

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

test('precipitation: rain, snow or dry', () => {
  assert.equal(precipitation('rain'), 'rain');
  assert.equal(precipitation('drizzle'), 'rain');
  assert.equal(precipitation('thunder'), 'rain');
  assert.equal(precipitation('snow'), 'snow');
  assert.equal(precipitation('clear'), null);
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
