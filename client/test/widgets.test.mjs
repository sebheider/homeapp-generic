import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WIDGET_TYPES } from '../../server/src/dashboard.js';
import {
  GRID_COLS, MAX_WIDGETS, WIDGETS, WIDGET_PARTS, addWidget, clampRect, scalesContent, widgetPart, findFreeSpot, gridRows, normalizeDashboard, overlaps, placeWidget, readingOrder, resolveCollisions, templateWidgets,
} from '../src/lib/widgets.ts';

const w = (id, x, y, width, h, type = 'text') => ({ id, type, x, y, w: width, h, options: {} });
const noOverlap = (list) => list.every((a, i) => list.every((b, j) => i === j || !overlaps(a, b)));

test('rectangles stay inside the grid and respect the smallest size of the widget', () => {
  assert.deepEqual(clampRect({ x: 11, y: -2, w: 4, h: 0 }, 'text'), { x: 8, y: 0, w: 4, h: 1 });
  assert.deepEqual(clampRect({ x: 0, y: 0, w: 1, h: 1 }, 'energy'), { x: 0, y: 0, w: 3, h: 4 });
  assert.deepEqual(clampRect({ x: 2.4, y: 3.6, w: 40, h: 99 }), { x: 0, y: 4, w: GRID_COLS, h: 24 });
  assert.deepEqual(clampRect({ x: 'a', y: NaN, w: undefined, h: null }, 'text'), { x: 0, y: 0, w: 1, h: 1 });
});

test('moving a widget onto others pushes them down, the moved one keeps its place', () => {
  const list = [w('a', 0, 0, 6, 2), w('b', 6, 0, 6, 2), w('c', 0, 2, 12, 2)];
  const next = placeWidget(list, 'c', { x: 0, y: 0, w: 12, h: 2 });
  assert.deepEqual(next.map(({ id, x, y }) => [id, x, y]), [['a', 0, 2], ['b', 6, 2], ['c', 0, 0]]);
  assert.ok(noOverlap(next));
  assert.deepEqual(list[2], w('c', 0, 2, 12, 2), 'the original list is not changed');
});

test('resizing pushes the widgets below further down; unchanged positions return the same list', () => {
  const list = [w('a', 0, 0, 4, 2), w('b', 0, 2, 4, 2), w('c', 0, 4, 4, 2), w('d', 4, 0, 4, 2)];
  const next = placeWidget(list, 'a', { x: 0, y: 0, w: 4, h: 3 });
  assert.deepEqual(next.map((x) => x.y), [0, 3, 5, 0]);
  assert.equal(next[3], list[3], 'widgets out of the way keep their identity');
  assert.equal(placeWidget(list, 'a', { x: 0, y: 0, w: 4, h: 2 }), list);
  assert.equal(placeWidget(list, 'missing', { x: 0, y: 0, w: 1, h: 1 }), list);
});

test('new widgets go to the first free place', () => {
  assert.deepEqual(findFreeSpot([], 4, 2), { x: 0, y: 0 });
  assert.deepEqual(findFreeSpot([w('a', 0, 0, 4, 2)], 4, 2), { x: 4, y: 0 });
  assert.deepEqual(findFreeSpot([w('a', 0, 0, 10, 2)], 4, 2), { x: 0, y: 2 });
  const list = addWidget(addWidget([], 'clock'), 'clock');
  assert.deepEqual(list.map(({ id, x, y, w: width, h }) => [id, x, y, width, h]), [['clock-1', 0, 0, 4, 3], ['clock-2', 4, 0, 4, 3]]);
  assert.equal(list[0].options.chips, true, 'new widgets get their default settings');
  const full = Array.from({ length: MAX_WIDGETS }, (_, i) => w(`t${i}`, 0, i, 1, 1));
  assert.equal(addWidget(full, 'text'), full);
});

test('stored start pages are cleaned: unknown types dropped, ids unique, overlaps resolved', () => {
  const list = normalizeDashboard({ widgets: [w('a', 0, 0, 4, 2), w('a', 2, 1, 4, 2), { id: 'x', type: 'evil', x: 0, y: 0, w: 1, h: 1 }, null] });
  assert.deepEqual(list.map((x) => x.id), ['a', 'text-1']);
  assert.ok(noOverlap(list));
  assert.deepEqual(normalizeDashboard(undefined), []);
  assert.deepEqual(normalizeDashboard({ widgets: 'x' }), []);
});

test('phones show the widgets in reading order; the template does not overlap', () => {
  const list = [w('c', 0, 3, 1, 1), w('b', 6, 0, 1, 1), w('a', 0, 0, 1, 1)];
  assert.deepEqual(readingOrder(list).map((x) => x.id), ['a', 'b', 'c']);
  const t = templateWidgets();
  assert.ok(noOverlap(t));
  assert.equal(resolveCollisions(t).every((x, i) => x === t[i]), true);
  assert.equal(gridRows(t), 18);
});

test('client and server know the same widget types', () => {
  assert.deepEqual([...WIDGET_TYPES].sort(), Object.keys(WIDGETS).sort());
});

test('kiosk sensor widget can be added and survives dashboard normalization', () => {
  const widgets = addWidget([], 'kiosk');
  assert.equal(widgets[0].type, 'kiosk');
  assert.deepEqual(normalizeDashboard({ widgets }), widgets);
});

test('detail widgets start with the size of the chosen part', () => {
  for (const [type, { option, parts }] of Object.entries(WIDGET_PARTS)) {
    for (const part of parts) {
      if (!part.size) continue;
      const [added] = addWidget([], type, { [option]: part.id });
      assert.deepEqual([added.w, added.h], part.size, `${type}/${part.id}`);
      assert.ok(part.size[0] >= WIDGETS[type].min[0] && part.size[1] >= WIDGETS[type].min[1] && part.size[0] <= GRID_COLS, `${type}/${part.id}`);
      assert.equal(widgetPart(added), part);
    }
  }
  const [uv] = addWidget([], 'weatherPart');
  assert.equal(uv.options.part, 'uv');
  assert.equal(widgetPart({ type: 'weatherPart', options: { part: 'nope' } }), undefined);
});

test('content scaling can be switched off and is skipped for self-sizing widgets', () => {
  assert.equal(scalesContent({ type: 'text', options: {} }), true);
  assert.equal(scalesContent({ type: 'text', options: { scale: false } }), false);
  assert.equal(scalesContent({ type: 'gauge', options: {} }), false);
  assert.equal(scalesContent({ type: 'energy', options: { chart: false } }), false);
  assert.equal(scalesContent({ type: 'weatherPart', options: { part: 'radar' } }), false);
  assert.equal(scalesContent({ type: 'weatherPart', options: { part: 'uv' } }), true);
});
