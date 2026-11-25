/**
 * Page navigation by swipe gestures on touch screens: swiping left opens the next page, swiping
 * right the previous one. Only clear, fast and mostly horizontal swipes count, so scrolling, taps
 * and short drags never switch the page. Gestures that start on something that uses horizontal
 * movement itself (form fields, sliders, charts, sideways scrolling strips) or inside an overlay
 * (dialogs, pop-ups) are ignored; `data-no-swipe` excludes further areas.
 */
import { useEffect, useRef, type RefObject } from 'react';

/** Minimum horizontal distance (px) of a swipe. */
export const SWIPE_MIN_PX = 70;
/** The horizontal distance must be at least this many times the vertical one. */
export const SWIPE_RATIO = 2;
/** Slower gestures are treated as dragging, not as a swipe (ms). */
export const SWIPE_MAX_MS = 800;

/** Direction of a finished gesture: 1 = next page (swipe left), -1 = previous page (swipe right), 0 = none. */
export function swipeDirection(dx: number, dy: number, ms: number): -1 | 0 | 1 {
  if (ms > SWIPE_MAX_MS || Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < SWIPE_RATIO * Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
}

/** True if a gesture starting on `target` must not switch the page (checked up to `root`). */
function ignoreTarget(target: EventTarget | null, root: HTMLElement) {
  for (let el = target instanceof Element ? target : null; el; el = el.parentElement) {
    if (el.matches('input, select, textarea, [contenteditable]:not([contenteditable="false"]), [data-no-swipe]')) return true;
    const css = getComputedStyle(el);
    // overlays (dialogs, pop-ups) that are rendered inside the page
    if (css.position === 'fixed') return true;
    // elements that use horizontal movement themselves (sliders, charts with touch-pan-y)
    if (css.touchAction === 'none' || (css.touchAction.includes('pan-y') && !css.touchAction.includes('pan-x'))) return true;
    // sideways scrolling strips
    if ((css.overflowX === 'auto' || css.overflowX === 'scroll') && el.scrollWidth > el.clientWidth) return true;
    if (el === root) break;
  }
  return false;
}

/**
 * Calls `onSwipe(1)` / `onSwipe(-1)` for swipes to the left / right inside the element `ref`.
 * `enabled` attaches the listeners (pass true once the element is rendered).
 */
interface SwipeOptions {
  onSwipe: (dir: 1 | -1) => boolean | void;
  onDrag?: (dx: number) => void;
  onCancel?: () => void;
  canSwipe?: (dir: 1 | -1) => boolean;
}

/** Native listeners are shared with the gesture regression tests. */
export function attachSwipe(root: HTMLElement, options: () => SwipeOptions) {
  let start: { x: number; y: number; t: number; horizontal: boolean } | null = null;
  let suppressClickUntil = 0;
  const cancel = () => {
    if (start?.horizontal) {
      suppressClickUntil = Date.now() + 500;
      options().onCancel?.();
    }
    start = null;
  };
  const onStart = (e: TouchEvent) => {
    cancel();
    suppressClickUntil = 0;
    start = e.touches.length === 1 && !ignoreTarget(e.target, root)
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), horizontal: false } : null;
  };
  const onMove = (e: TouchEvent) => {
    if (!start) return;
    if (e.touches.length !== 1) return cancel();
    const dx = e.touches[0].clientX - start.x;
    const dy = e.touches[0].clientY - start.y;
    if (!start.horizontal) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return;
      // Once vertical intent wins, this gesture belongs to the scroll container.
      if (Math.abs(dx) < SWIPE_RATIO * Math.abs(dy)) return cancel();
      if (!e.cancelable) return cancel();
      start.horizontal = true;
    }
    if (!e.cancelable) return cancel();
    e.preventDefault();
    const allowed = options().canSwipe?.(dx < 0 ? 1 : -1) !== false;
    options().onDrag?.(allowed ? dx : Math.sign(dx) * Math.min(32, Math.abs(dx) * 0.18));
  };
  const onEnd = (e: TouchEvent) => {
    if (!start) return;
    if (e.touches.length || !e.changedTouches.length) return cancel();
    const t = e.changedTouches[0];
    const dir = swipeDirection(t.clientX - start.x, t.clientY - start.y, Date.now() - start.t);
    const dragged = start.horizontal;
    start = null;
    if (dragged || dir) {
      suppressClickUntil = Date.now() + 500;
      if (e.cancelable) e.preventDefault();
    }
    if (dir && options().canSwipe?.(dir) !== false && options().onSwipe(dir) !== false) return;
    options().onCancel?.();
  };
  const onClick = (e: MouseEvent) => {
    if (e.detail !== 0 && Date.now() < suppressClickUntil) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  root.addEventListener('touchstart', onStart, { passive: true });
  root.addEventListener('touchmove', onMove, { passive: false });
  root.addEventListener('touchend', onEnd, { passive: false });
  root.addEventListener('touchcancel', cancel, { passive: true });
  root.addEventListener('click', onClick, true);
  return () => {
    root.removeEventListener('touchstart', onStart);
    root.removeEventListener('touchmove', onMove);
    root.removeEventListener('touchend', onEnd);
    root.removeEventListener('touchcancel', cancel);
    root.removeEventListener('click', onClick, true);
  };
}

export function useSwipe(ref: RefObject<HTMLElement | null>, onSwipe: SwipeOptions['onSwipe'], enabled = true, feedback: Omit<SwipeOptions, 'onSwipe'> = {}) {
  const options = useRef<SwipeOptions>({ onSwipe, ...feedback });
  options.current = { onSwipe, ...feedback };
  useEffect(() => {
    const root = ref.current;
    if (!enabled || !root) return;
    return attachSwipe(root, () => options.current);
  }, [ref, enabled]);
}
