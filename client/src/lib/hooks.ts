/** Small generic React hooks shared by several components. */
import { useEffect, useId, useState, type RefObject } from 'react';

/** `useId` without the colons, so it can be used in `url(#…)` references of SVG gradients, masks and filters. */
export const useSvgId = (prefix: string) => `${prefix}-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

/**
 * Current time in milliseconds, refreshed every `intervalMs`.
 * Also useful just to re-render a component periodically (e.g. for "x min ago" labels).
 */
export function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/**
 * Rounded content size of an element, kept up to date with a ResizeObserver.
 * Pass `mounted` when the element is rendered conditionally, so the observer attaches once it exists.
 */
export function useElementSize(ref: RefObject<HTMLElement | null>, initial: { w: number; h: number }, mounted = true) {
  const [size, setSize] = useState(initial);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [mounted]);
  return size;
}

/** Whether a CSS media query matches (follows changes, e.g. rotating a tablet). */
export function useMedia(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}
