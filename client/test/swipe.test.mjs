import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachSwipe, swipeDirection } from '../src/lib/swipe.ts';

class Element extends EventTarget {
  constructor({ parent = null, excluded = false, css = {}, scrollWidth = 0, clientWidth = 0 } = {}) {
    super();
    Object.assign(this, { parentElement: parent, excluded, css, scrollWidth, clientWidth });
  }
  matches() { return this.excluded; }
}
globalThis.Element = Element;
globalThis.getComputedStyle = (el) => ({ position: 'static', touchAction: 'auto', overflowX: 'visible', ...el.css });
const point = (x, y = 0) => ({ clientX: x, clientY: y });

function gesture(options = {}) {
  const root = new Element();
  const swipes = [], drags = [];
  let cancels = 0;
  const detach = attachSwipe(root, () => ({
    onSwipe: (dir) => swipes.push(dir), onDrag: (dx) => drags.push(dx), onCancel: () => cancels++, ...options,
  }));
  const send = (type, touches, changedTouches = [], target = root, cancelable = true) => {
    const event = new Event(type, { cancelable });
    Object.defineProperties(event, { touches: { value: touches }, changedTouches: { value: changedTouches }, target: { value: target } });
    root.dispatchEvent(event);
    return event;
  };
  return { root, send, swipes, drags, cancels: () => cancels, detach };
}

test('release thresholds retain distance, ratio, time and direction semantics', () => {
  assert.equal(swipeDirection(-70, 35, 800), 1);
  assert.equal(swipeDirection(70, 0, 100), -1);
  for (const args of [[69, 0, 100], [90, 46, 100], [100, 0, 801], [0, 100, 100]]) {
    assert.equal(swipeDirection(...args), 0);
  }
});

test('horizontal intent follows the finger, commits and suppresses synthetic clicks', () => {
  const g = gesture();
  g.send('touchstart', [point(200)]);
  assert.equal(g.send('touchmove', [point(195, 1)]).defaultPrevented, false);
  assert.equal(g.send('touchmove', [point(100, 5)]).defaultPrevented, true);
  assert.deepEqual(g.drags, [-100]);
  assert.equal(g.send('touchend', [], [point(90, 5)]).defaultPrevented, true);
  assert.deepEqual(g.swipes, [1]);
  const click = new Event('click', { cancelable: true });
  Object.defineProperty(click, 'detail', { value: 1 });
  g.root.dispatchEvent(click);
  assert.equal(click.defaultPrevented, true);
  const keyboardClick = new Event('click', { cancelable: true });
  Object.defineProperty(keyboardClick, 'detail', { value: 0 });
  g.root.dispatchEvent(keyboardClick);
  assert.equal(keyboardClick.defaultPrevented, false);
  g.detach();
});

test('short drags, cancellation and multi-touch snap back without navigating', () => {
  for (const finish of ['short', 'touchcancel', 'multi-move', 'multi-start']) {
    const g = gesture();
    g.send('touchstart', [point(200)]);
    g.send('touchmove', [point(170)]);
    if (finish === 'touchcancel') g.send('touchcancel', []);
    if (finish === 'multi-move') g.send('touchmove', [point(100), point(110)]);
    if (finish === 'multi-start') g.send('touchstart', [point(100), point(110)]);
    g.send('touchend', [], [point(finish === 'short' ? 170 : 10)]);
    assert.deepEqual(g.swipes, [], finish);
    assert.equal(g.cancels(), 1, finish);
    g.detach();
  }
});

test('vertical scrolling and browser-owned gestures never become page swipes', () => {
  for (const cancelable of [true, false]) {
    const g = gesture();
    g.send('touchstart', [point(200)]);
    const move = g.send('touchmove', [point(cancelable ? 195 : 100, cancelable ? 30 : 0)], [], g.root, cancelable);
    assert.equal(move.defaultPrevented, false);
    g.send('touchmove', [point(0)]);
    g.send('touchend', [], [point(0)]);
    assert.deepEqual(g.drags, []);
    assert.deepEqual(g.swipes, []);
    g.detach();
  }
});

test('slow drags snap back and unfinished multi-touch cannot commit', () => {
  const now = Date.now;
  let time = now();
  Date.now = () => time;
  try {
    const g = gesture();
    g.send('touchstart', [point(200)]);
    g.send('touchmove', [point(50)]);
    time += 801;
    g.send('touchend', [], [point(50)]);
    assert.deepEqual(g.swipes, []);
    assert.equal(g.cancels(), 1);
    g.send('touchstart', [point(200)]);
    g.send('touchmove', [point(50)]);
    g.send('touchend', [point(50)], [point(50)]);
    g.send('touchend', [], [point(0)]);
    assert.deepEqual(g.swipes, []);
    assert.equal(g.cancels(), 2);
    g.detach();
  } finally {
    Date.now = now;
  }
});

test('edges resist and snap back; a rejected navigation also resets', () => {
  for (const options of [{ canSwipe: () => false }, { onSwipe: () => false }]) {
    const g = gesture(options);
    g.send('touchstart', [point(200)]);
    g.send('touchmove', [point(0)]);
    if (options.canSwipe) assert.equal(g.drags[0], -32);
    g.send('touchend', [], [point(0)]);
    assert.deepEqual(g.swipes, []);
    assert.equal(g.cancels(), 1);
    g.detach();
  }
});

test('controls, overlays, charts and horizontal strips are excluded, including ancestors', () => {
  for (const props of [
    { excluded: true }, { css: { position: 'fixed' } }, { css: { touchAction: 'none' } },
    { css: { touchAction: 'pan-y' } }, { css: { overflowX: 'auto' }, scrollWidth: 200, clientWidth: 100 },
    { css: { overflowX: 'scroll' }, scrollWidth: 200, clientWidth: 100 },
  ]) {
    const g = gesture();
    const excluded = new Element({ parent: g.root, ...props });
    const target = new Element({ parent: excluded });
    g.send('touchstart', [point(200)], [], target);
    g.send('touchmove', [point(0)], [], target);
    g.send('touchend', [], [point(0)], target);
    assert.deepEqual(g.swipes, []);
    assert.deepEqual(g.drags, []);
    g.detach();
  }
});

test('taps and new deliberate touches remain usable; listeners detach cleanly', () => {
  const g = gesture();
  g.send('touchstart', [point(200)]);
  assert.equal(g.send('touchend', [], [point(200)]).defaultPrevented, false);
  assert.deepEqual(g.swipes, []);
  g.detach();
  g.send('touchstart', [point(200)]);
  g.send('touchend', [], [point(0)]);
  assert.deepEqual(g.swipes, []);
});
