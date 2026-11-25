import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_FIT_SCALE, fitScale } from '../src/lib/fit.ts';

/** Content of a fixed size that does not reflow. */
const fixed = (h) => () => h;
/** Text-like content: a fixed area that wraps, so narrower layouts get taller. */
const flowing = (area) => (w) => area / w;

test('content that is already larger than its box is not scaled', () => {
  assert.equal(fitScale({ width: 300, height: 100, minWidth: 100, heightAt: fixed(150) }), 1);
  assert.equal(fitScale({ width: 300, height: 100, minWidth: 100, heightAt: fixed(100) }), 1);
});

test('the factor fills the height when the width allows it', () => {
  assert.equal(fitScale({ width: 600, height: 200, minWidth: 100, heightAt: fixed(100) }), 2);
});

test('the layout never gets narrower than the narrowest width of the content', () => {
  // the height would allow 4×, but at 600 / 4 = 150 px the content (min 200 px) would be cut off
  assert.equal(fitScale({ width: 600, height: 400, minWidth: 200, heightAt: fixed(100) }), 3);
});

test('content that wraps gets the largest factor that still fits', () => {
  const heightAt = flowing(30000); // 300 px wide → 100 px high
  const s = fitScale({ width: 300, height: 200, minWidth: 50, heightAt });
  // at the factor s the layout is 300 / s wide and 100 · s high: 100 · s · s ≤ 200 → s ≈ 1.41
  assert.ok(s > 1.35 && s <= Math.SQRT2, `got ${s}`);
  assert.ok(heightAt(300 / s) * s <= 200);
});

test('the factor is limited and tiny factors are ignored', () => {
  assert.equal(fitScale({ width: 2000, height: 2000, minWidth: 10, heightAt: fixed(10) }), MAX_FIT_SCALE);
  assert.equal(fitScale({ width: 2000, height: 2000, minWidth: 10, heightAt: fixed(10), max: 2.5 }), 2.5);
  assert.equal(fitScale({ width: 300, height: 101, minWidth: 10, heightAt: fixed(100) }), 1);
});

test('empty or hidden boxes are not scaled', () => {
  assert.equal(fitScale({ width: 0, height: 100, minWidth: 0, heightAt: fixed(10) }), 1);
  assert.equal(fitScale({ width: 100, height: 100, minWidth: 0, heightAt: fixed(0) }), 1);
});

test('layout widths reported as unusable (Infinity) are avoided', () => {
  // below 250 px texts would be shortened: 400 / 250 = 1.6 is the largest usable factor
  const s = fitScale({ width: 400, height: 1000, minWidth: 50, heightAt: (w) => (w < 250 ? Infinity : 100) });
  assert.ok(s >= 1.55 && s <= 1.6, String(s));
});
