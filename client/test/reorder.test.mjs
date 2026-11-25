import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveItem } from '../src/lib/reorder.ts';

test('dragging can move entries in both directions and to either end', () => {
  const items = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moveItem(items, 0, 3), ['b', 'c', 'd', 'a']);
  assert.deepEqual(moveItem(items, 3, 0), ['d', 'a', 'b', 'c']);
  assert.deepEqual(moveItem(items, 1, 2), ['a', 'c', 'b', 'd']);
  assert.deepEqual(items, ['a', 'b', 'c', 'd']);
});

test('keyboard boundaries, empty lists and invalid positions are no-ops', () => {
  for (const items of [[], ['a'], ['a', 'b']]) {
    for (const [from, to] of [[0, -1], [0, items.length], [-1, 0], [items.length, 0], [0, 0], [0.5, 0], [0, NaN]]) {
      assert.equal(moveItem(items, from, to), items);
    }
  }
});

test('reordering preserves object identities, hidden entries and all other data', () => {
  const items = [{ id: 'room-a', hidden: true }, { id: 'room-b' }, { id: 'room-c' }];
  const next = moveItem(items, 0, 2);
  assert.deepEqual(next, [items[1], items[2], items[0]]);
  assert.equal(next[2], items[0]);
  assert.equal(next[2].hidden, true);
});
