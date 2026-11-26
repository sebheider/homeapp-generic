/** Helpers of the HUD building blocks: accent colour, mount flag and SVG arc geometry. */
import { useEffect, useState, type CSSProperties } from 'react';

/** Sets the accent colour of a HUD element (CSS custom property `--tone`). */
export const toneStyle = (color: string): CSSProperties => ({ ['--tone' as string]: color });

/** False in the first frame, then true: lets gauges animate from empty to their first value. */
export function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return mounted;
}

/** Point on a circle (angle in degrees, 0 = 3 o'clock, clockwise). */
export const polar = (cx: number, cy: number, r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
};

/** SVG path of an arc between two angles. */
export const arcPath = (cx: number, cy: number, r: number, from: number, to: number) => {
  const [x1, y1] = polar(cx, cy, r, from);
  const [x2, y2] = polar(cx, cy, r, to);
  return `M ${x1} ${y1} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
};
