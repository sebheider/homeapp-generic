import { test } from 'node:test';
import assert from 'node:assert/strict';
import { num, timeAgo, toNum } from '../src/lib/format.ts';

test('timeAgo never shows negative durations for timestamps slightly in the future', () => {
  assert.equal(timeAgo(Date.now() + 5000), 'vor 0 s');
  assert.equal(timeAgo(Date.now() - 30_000), 'vor 30 s');
  assert.equal(timeAgo(Date.now() - 5 * 60_000), 'vor 5 min');
  assert.equal(timeAgo(Date.now() - 2 * 3_600_000), 'vor 2 h');
});

test('cached number formatters keep the requested digits apart', () => {
  assert.equal(num(1234.5, 0), '1.235');
  assert.equal(num(2.345, 2), '2,35');
  assert.equal(num(2.345, 1), '2,3');
  assert.equal(num(2, 2), '2');
});

test('toNum accepts numeric strings as delivered by some adapters', () => {
  assert.equal(toNum('42'), 42);
  assert.equal(toNum('abc', 7), 7);
});
