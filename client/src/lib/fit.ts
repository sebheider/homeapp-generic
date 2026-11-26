/**
 * Zoom factor for content that should grow with its box (widgets of the own start page that were
 * made larger than their content). Pure function, the DOM measuring is done by `ScaleUp` (components/hud/scale.tsx).
 *
 * The content is laid out at the width `width / s` and then enlarged by `s`, so it always fills the
 * width. The largest `s` is chosen whose enlarged height still fits `height`, without making the
 * layout width smaller than the narrowest width the content can take (`minWidth`, so nothing is cut
 * off or overflows) and not above `max`. Content that is already larger than its box keeps `s = 1`.
 */

/** Largest zoom factor. */
export const MAX_FIT_SCALE = 4;
/** Factors below this are not worth it (and would only blur the content a little). */
const MIN_FIT_SCALE = 1.02;

export interface FitInput {
  /** Size of the box (px). */
  width: number;
  height: number;
  /** Narrowest width of the content (min-content, px). */
  minWidth: number;
  /** Height of the content when laid out at the given width (px, not enlarged). */
  heightAt: (layoutWidth: number) => number;
  max?: number;
}

export function fitScale({ width, height, minWidth, heightAt, max = MAX_FIT_SCALE }: FitInput): number {
  if (!(width > 0) || !(height > 0)) return 1;
  const natural = heightAt(width);
  if (!(natural > 0)) return 1;
  const upper = Math.min(max, height / natural, minWidth > 0 ? width / minWidth : max);
  if (!(upper >= MIN_FIT_SCALE)) return 1;
  const fits = (s: number) => heightAt(width / s) * s <= height;
  let s = upper;
  if (!fits(upper)) {
    // narrower layouts get taller: search the largest factor that still fits
    let lo = 1;
    let hi = upper;
    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) lo = mid;
      else hi = mid;
    }
    s = lo;
  }
  s = Math.floor(s * 100) / 100;
  return s >= MIN_FIT_SCALE ? s : 1;
}
