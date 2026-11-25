import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flowDuration, frameStats, fpsRequested } from '../src/lib/perf.ts';

test('frameStats: steady 60 Hz', () => {
  const times = Array.from({ length: 61 }, (_, i) => i * (1000 / 60));
  assert.deepEqual(frameStats(times), { fps: 60, worst: 17, jank: 0 });
});

test('frameStats: a stutter shows up as worst frame and jank', () => {
  const times = [0, 16, 32, 48, 148, 164];
  const s = frameStats(times);
  assert.equal(s.worst, 100);
  assert.equal(s.jank, 0.2);
});

test('frameStats: too few frames', () => {
  assert.deepEqual(frameStats([]), { fps: 0, worst: 0, jank: 0 });
  assert.deepEqual(frameStats([5]), { fps: 0, worst: 0, jank: 0 });
});

test('fpsRequested reads ?fps=1', () => {
  assert.equal(fpsRequested('?fps=1'), true);
  assert.equal(fpsRequested('?kiosk=1&fps=true'), true);
  assert.equal(fpsRequested('?fps=0'), false);
  assert.equal(fpsRequested(''), false);
});

test('flowDuration: faster with more power, clamped', () => {
  assert.equal(flowDuration(0), 2.6);
  assert.equal(flowDuration(-5000), 0.9);
  assert.equal(flowDuration(20000), 0.9);
  assert.ok(flowDuration(1000) < flowDuration(500));
});
