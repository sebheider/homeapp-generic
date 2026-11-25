import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adjacentPage, enabledPages, navigationDirection, pagePosition } from '../src/lib/navigation.ts';

test('enabled order is shared by positions, adjacency and navigation direction', () => {
  for (const weather of [true, false]) {
    const pages = enabledPages(weather);
    assert.equal(pages.length, weather ? 7 : 6);
    pages.forEach((page, index) => {
      assert.deepEqual(pagePosition(pages, page.id), { label: page.label, ordinal: index + 1, total: pages.length });
      assert.equal(adjacentPage(pages, page.id, 1), pages[index + 1]);
      assert.equal(adjacentPage(pages, page.id, -1), pages[index - 1]);
      for (const [otherIndex, other] of pages.entries()) {
        assert.equal(navigationDirection(pages, page.id, other.id), Math.sign(otherIndex - index));
      }
    });
  }
});

test('settings and disabled destinations are outside the swipe order', () => {
  const pages = enabledPages(false);
  assert.equal(adjacentPage(pages, 'home', -1), undefined);
  assert.equal(adjacentPage(pages, 'cameras', 1), undefined);
  for (const view of ['settings', 'weather']) {
    assert.equal(adjacentPage(pages, view, 1), undefined);
    assert.equal(adjacentPage(pages, view, -1), undefined);
    assert.equal(pagePosition(pages, view).ordinal, null);
    assert.equal(navigationDirection(pages, 'home', view), 0);
    assert.equal(navigationDirection(pages, view, 'home'), 0);
  }
  assert.equal(pagePosition(pages, 'settings').label, 'Einstellungen');
});

test('rapid navigation and configuration changes derive direction afresh', () => {
  assert.equal(navigationDirection(enabledPages(), 'home', 'energy'), 1);
  assert.equal(navigationDirection(enabledPages(), 'energy', 'rooms'), -1);
  assert.equal(navigationDirection(enabledPages(false), 'rooms', 'lights'), 1);
  assert.equal(navigationDirection(enabledPages(false), 'weather', 'rooms'), 0);
  assert.equal(navigationDirection(enabledPages(), 'rooms', 'rooms'), 0);
});

test('the printer page only belongs to the navigation while a printer is set up', () => {
  assert.equal(enabledPages().some((p) => p.id === 'printer'), false);
  const pages = enabledPages(true, true);
  assert.equal(pages.length, 8);
  assert.deepEqual(pages.at(-1), { id: 'printer', label: '3D-Drucker' });
  assert.equal(adjacentPage(pages, 'cameras', 1)?.id, 'printer');
  assert.equal(adjacentPage(pages, 'printer', 1), undefined);
  assert.deepEqual(pagePosition(pages, 'printer'), { label: '3D-Drucker', ordinal: 8, total: 8 });
  // without a printer the page is outside the swipe order but keeps its name
  assert.deepEqual(pagePosition(enabledPages(), 'printer'), { label: '3D-Drucker', ordinal: null, total: 7 });
  assert.equal(enabledPages(false, true).length, 7);
});

test('the Spotify page sits between cameras and printer while Spotify is set up', () => {
  assert.equal(enabledPages().some((p) => p.id === 'spotify'), false);
  const pages = enabledPages(true, true, true);
  assert.deepEqual(pages.map((p) => p.id).slice(-3), ['cameras', 'spotify', 'printer']);
  assert.deepEqual(pagePosition(pages, 'spotify'), { label: 'Spotify', ordinal: 8, total: 9 });
  assert.equal(adjacentPage(enabledPages(true, false, true), 'spotify', 1), undefined);
  assert.equal(navigationDirection(pages, 'spotify', 'printer'), 1);
});

test('the mower page sits between printer and radar while a robotic mower is configured', () => {
  assert.equal(enabledPages(true, true, true, true).some((p) => p.id === 'mower'), false);
  const pages = enabledPages(true, true, true, true, true);
  assert.deepEqual(pages.map((p) => p.id).slice(-3), ['printer', 'mower', 'radar']);
  assert.equal(adjacentPage(enabledPages(true, false, false, false, true), 'cameras', 1)?.id, 'mower');
  assert.equal(adjacentPage(enabledPages(true, false, false, false, true), 'mower', 1), undefined);
  // without a mower the page keeps its name (opened through the URL hash)
  assert.deepEqual(pagePosition(enabledPages(), 'mower'), { label: 'Mähroboter', ordinal: null, total: 7 });
});

test('the radar page comes last once a presence radar reported', () => {
  assert.equal(enabledPages(true, true, true).some((p) => p.id === 'radar'), false);
  const pages = enabledPages(true, true, true, true);
  assert.deepEqual(pages.at(-1), { id: 'radar', label: 'Radar' });
  assert.equal(adjacentPage(pages, 'printer', 1)?.id, 'radar');
  assert.equal(adjacentPage(enabledPages(true, false, false, true), 'cameras', 1)?.id, 'radar');
  // without a radar the page keeps its name (opened through the URL hash)
  assert.deepEqual(pagePosition(enabledPages(), 'radar'), { label: 'Radar', ordinal: null, total: 7 });
});
