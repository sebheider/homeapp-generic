// Freely designable start page: cleaning of the widgets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeDashboard, MAX_WIDGETS } from '../src/dashboard.js';

test('sanitizeDashboard keeps known widgets inside the grid', () => {
  const d = sanitizeDashboard({
    widgets: [
      { id: 'w1', type: 'clock', x: 10, y: -3, w: 4, h: 99, options: { chips: true } },
      { id: 'w2', type: 'unknown', x: 0, y: 0, w: 1, h: 1 },
      { id: 'w3', type: 'text', x: 'a', y: 2.6, w: 30, h: 0 },
      null,
    ],
  });
  assert.deepEqual(d.widgets, [
    { id: 'w1', type: 'clock', x: 8, y: 0, w: 4, h: 24, options: { chips: true } },
    { id: 'w3', type: 'text', x: 0, y: 3, w: 12, h: 1, options: {} },
  ]);
  assert.deepEqual(sanitizeDashboard(), { widgets: [] });
  assert.deepEqual(sanitizeDashboard({ widgets: 'x' }), { widgets: [] });
});

test('sanitizeDashboard makes ids unique and cleans the options', () => {
  const d = sanitizeDashboard({
    widgets: [
      { id: 'a', type: 'devices', options: { devices: ['d1', 'd1', 3, ''], title: 'x'.repeat(3000), evil: { nested: true }, 'bad-key': 1, n: Infinity } },
      { id: 'a', type: 'text' },
      { type: 'room' },
    ],
  });
  assert.deepEqual(d.widgets.map((w) => w.id), ['a', 'a-2', 'room']);
  assert.deepEqual(d.widgets[0].options.devices, ['d1']);
  assert.equal(d.widgets[0].options.title.length, 2000);
  assert.deepEqual(Object.keys(d.widgets[0].options), ['devices', 'title']);
  const many = sanitizeDashboard({ widgets: Array.from({ length: 100 }, () => ({ type: 'text' })) });
  assert.equal(many.widgets.length, MAX_WIDGETS);
});

test('sanitizeDashboard keeps the detail widgets and their display options', () => {
  const d = sanitizeDashboard({
    widgets: [
      { id: 'uv', type: 'weatherPart', x: 0, y: 0, w: 4, h: 4, options: { part: 'uv', scale: false } },
      { id: 'pv', type: 'energyPart', x: 4, y: 0, w: 2, h: 2, options: { part: 'production' } },
      { id: 'l', type: 'lights', x: 6, y: 0, w: 6, h: 4, options: { compact: true } },
    ],
  });

  assert.deepEqual(d.widgets.map((w) => [w.type, w.options]), [
    ['weatherPart', { part: 'uv', scale: false }],
    ['energyPart', { part: 'production' }],
    ['lights', { compact: true }],
  ]);
});

test('kiosk sensor widget survives server sanitization', () => {
  const widget = { id: 'sensors', type: 'kiosk', x: 0, y: 0, w: 6, h: 4, options: {} };
  assert.deepEqual(sanitizeDashboard({ widgets: [widget] }), { widgets: [widget] });
});
