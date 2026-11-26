/** Scaling of HUD content: enlarge it to the available box (`ScaleUp`) or fit a design of fixed size (`FitBox`). */
import { createContext, useLayoutEffect, useRef, type ReactNode } from 'react';
import { useElementSize } from '../../lib/hooks';
import { fitScale } from '../../lib/fit';

/**
 * True: `HudPanel`s below enlarge their content to the space of the panel (see `ScaleUp`). Set by
 * the own start page for widgets that were made larger than their content.
 */
export const HudScale = createContext(false);

/**
 * Enlarges its content as far as the box allows (never shrinks it; content that does not fit keeps
 * its size). The content is laid out narrower and scaled up, so it keeps filling the width; see
 * lib/fit.ts. Narrower layouts that would shorten more texts (`truncate`, `line-clamp-*`) than at the
 * normal size are not used. `stretch`: the content also fills the height (cards that should cover the
 * whole box). Sizes are measured again whenever the box or the content changes size, and when changed
 * texts no longer fit.
 */
export function ScaleUp({ children, className = '', stretch = false }: { children: ReactNode; className?: string; stretch?: boolean }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const box = outer.current;
    const el = inner.current;
    if (!box || !el) return;
    let frame = 0;
    let shortened = 0;
    const apply = () => {
      frame = 0;
      const width = box.clientWidth;
      const height = box.clientHeight;
      const st = el.style;
      st.transform = '';
      st.minHeight = '';
      st.width = '';
      const clipped = clippedTexts(el);
      st.width = 'min-content';
      const minWidth = el.getBoundingClientRect().width;
      const s = fitScale({
        width,
        height,
        minWidth,
        heightAt: (w) => {
          st.width = `${w}px`;
          return clippedTexts(el) > clipped ? Infinity : el.getBoundingClientRect().height;
        },
      });
      st.width = s > 1 ? `${width / s}px` : '';
      st.transform = s > 1 ? `scale(${s})` : '';
      if (stretch) st.minHeight = `${height / s}px`;
      shortened = clippedTexts(el);
    };
    apply();
    // measured again in the next frame: changing the size inside the observer callback would loop
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const ro = new ResizeObserver(schedule);
    ro.observe(box);
    ro.observe(el);
    // live values that got longer (e.g. "0 W" → "125 W") do not change the size but no longer fit
    const mo = new MutationObserver(() => {
      if (!frame && (el.scrollWidth > el.clientWidth + 1 || clippedTexts(el) > shortened)) schedule();
    });
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [stretch]);
  return (
    <div ref={outer} className={`scale-up ${className}`}>
      <div ref={inner} className={`scale-up-inner ${stretch ? 'is-stretch' : ''}`}>{children}</div>
    </div>
  );
}

/** Number of shortened texts (ellipsis) below `root`. */
function clippedTexts(root: HTMLElement): number {
  let n = 0;
  root.querySelectorAll<HTMLElement>('.truncate').forEach((t) => {
    if (t.scrollWidth > t.clientWidth + 1) n++;
  });
  root.querySelectorAll<HTMLElement>('[class*="line-clamp-"]').forEach((t) => {
    if (t.scrollHeight > t.clientHeight + 1) n++;
  });
  return n;
}

/**
 * Shows content that was designed for a fixed size (`baseW` × `baseH` px at the default root font
 * size of 16 px; the base grows with the root font, e.g. in the scaled kiosk mode) as large as the box
 * allows, keeping its proportions (like `object-fit: contain`). Used for the energy flow in kiosk mode.
 */
export function FitBox({ baseW, baseH, children, className = '' }: { baseW: number; baseH: number; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = useElementSize(ref, { w: baseW, h: baseH });
  const rem = (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) / 16;
  const scale = Math.max(0.1, Math.min(w / (baseW * rem), h / (baseH * rem)));
  return (
    <div ref={ref} className={`relative overflow-hidden ${className}`}>
      <div className="absolute left-1/2 top-1/2" style={{ width: `${baseW / 16}rem`, height: `${baseH / 16}rem`, transform: `translate(-50%, -50%) scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}
