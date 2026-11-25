/**
 * Futuristic "HUD" building blocks of the overview page: glowing panels with corner brackets and a
 * running light edge, count-up numbers, arc gauges, a liquid battery gauge, a ring of light segments
 * and the animated "Home Core". All continuous animations are CSS transforms / opacity (cheap on wall
 * tablets) and stop when the system asks for reduced motion (see index.css).
 */
import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { motion, useSpring, useTransform } from 'motion/react';
import { House } from 'lucide-react';
import { clamp, num } from '../lib/format';
import { useElementSize } from '../lib/hooks';
import { fitScale } from '../lib/fit';

/** Sets the accent colour of a HUD element (CSS custom property `--tone`). */
export const toneStyle = (color: string): CSSProperties => ({ ['--tone' as string]: color });

/** False in the first frame, then true: lets gauges animate from empty to their first value. */
function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return mounted;
}

/** `useId` without the colons, so it can be used in `url(#…)`. */
const useSvgId = (prefix: string) => `${prefix}-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

/** Point on a circle (angle in degrees, 0 = 3 o'clock, clockwise). */
const polar = (cx: number, cy: number, r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
};

/** SVG path of an arc between two angles. */
const arcPath = (cx: number, cy: number, r: number, from: number, to: number) => {
  const [x1, y1] = polar(cx, cy, r, from);
  const [x2, y2] = polar(cx, cy, r, to);
  return `M ${x1} ${y1} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
};

/**
 * Glass panel in HUD style: fine grid and glowing corner brackets; `edge` adds a light that runs
 * around the edge (only for the main panel of a page: every running light is a large GPU layer).
 * `color` is the accent of the panel.
 */
export function HudPanel({
  title, color, right, children, className = '', bodyClassName = '', onClick, edge = false,
}: {
  title?: ReactNode; color: string; right?: ReactNode; children: ReactNode; className?: string;
  edge?: boolean;
  /** Extra classes of the content area (e.g. flex layouts that fill the panel). */
  bodyClassName?: string;
  onClick?: () => void;
}) {
  const scale = useContext(HudScale);
  const body = <div className={`relative ${bodyClassName}`}>{children}</div>;
  return (
    <section className={`hud ${onClick ? 'hud-click' : ''} ${className}`} style={toneStyle(color)} onClick={onClick}>
      {edge && <span className="hud-edge" aria-hidden />}
      {title && (
        <header className="hud-head">
          <span className="hud-dot" aria-hidden />
          <h2 className="hud-title">{title}</h2>
          {right && <div className="ml-auto flex items-center gap-2 text-xs text-muted">{right}</div>}
        </header>
      )}
      {scale ? (
        <ScaleUp className="relative">
          <HudScale.Provider value={false}>{body}</HudScale.Provider>
        </ScaleUp>
      ) : (
        body
      )}
    </section>
  );
}

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
/** Number that counts smoothly (spring) to every new value; counts up from 0 when it appears. */
export function AnimatedNumber({ value, digits = 0 }: { value: number; digits?: number }) {
  const spring = useSpring(0, { stiffness: 70, damping: 18 });
  useEffect(() => {
    spring.set(value);
  }, [value, spring]);
  const text = useTransform(spring, (v) => num(v, digits));
  return <motion.span className="tabular-nums">{text}</motion.span>;
}

/** Value with unit in the middle of a gauge; '–' when unknown. */
function GaugeValue({ value, digits, unit }: { value: number | null; digits: number; unit: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center text-center pointer-events-none">
      <div className="hud-gauge-value text-[1.6rem] sm:text-3xl font-bold tracking-tight leading-none whitespace-nowrap">
        {value == null ? '–' : <AnimatedNumber value={value} digits={digits} />}
        <span className="text-xs sm:text-sm text-muted font-semibold ml-0.5">{unit}</span>
      </div>
    </div>
  );
}

/** Square gauge area plus a caption below it. */
function GaugeFrame({ children, label, style }: { children: ReactNode; label?: ReactNode; style?: CSSProperties }) {
  return (
    <div className="hud-gauge flex flex-col items-center" style={style}>
      <div className="hud-gauge-face relative aspect-square w-full max-w-[12rem]">{children}</div>
      {label && <div className="hud-gauge-label text-[0.72rem] text-muted text-center mt-1 leading-snug min-h-[2.2em]">{label}</div>}
    </div>
  );
}

/**
 * Arc gauge (270°) with tick marks, a slowly turning outer ring, a gradient arc with glow and a
 * pulsing end marker. The arc grows from zero when the gauge appears and follows value changes.
 */
export function ArcGauge({
  value, min = 0, max, digits = 0, unit, colors, label, backdrop,
}: {
  value: number | null; min?: number; max: number; digits?: number; unit: string;
  /** Gradient of the arc: start (low values) and end colour. */
  colors: [string, string];
  label?: ReactNode;
  /** Faint picture inside the ring behind the value (e.g. a turning fan while the heat pump runs). */
  backdrop?: ReactNode;
}) {
  const mounted = useMounted();
  const gid = useSvgId('arc');
  const frac = value == null ? 0 : clamp((value - min) / (max - min || 1), 0, 1);
  const shown = mounted ? frac : 0;
  const ticks = Array.from({ length: 37 }, (_, i) => i);
  return (
    <GaugeFrame label={label}>
      <svg viewBox="0 0 200 200" className="w-full h-full overflow-visible">
        <defs>
          <linearGradient id={gid} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor={colors[0]} />
            <stop offset="1" stopColor={colors[1]} />
          </linearGradient>
        </defs>
        <g className="hud-spin hud-spin-60" style={{ transformOrigin: '100px 100px' }}>
          <circle cx="100" cy="100" r="96" fill="none" stroke="var(--tone)" strokeOpacity="0.35" strokeWidth="1" strokeDasharray="1 7" />
          <path d={arcPath(100, 100, 96, -20, 20)} fill="none" stroke="var(--tone)" strokeWidth="2" strokeLinecap="round" />
          <path d={arcPath(100, 100, 96, 160, 200)} fill="none" stroke="var(--tone)" strokeWidth="2" strokeLinecap="round" />
        </g>
        {/* scale: 36 steps over 270°, every sixth one longer */}
        {ticks.map((i) => {
          const deg = 135 + (270 * i) / 36;
          const [x1, y1] = polar(100, 100, i % 6 ? 66 : 62, deg);
          const [x2, y2] = polar(100, 100, 70, deg);
          const lit = i / 36 <= shown && value != null;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={lit ? colors[1] : 'var(--muted)'} strokeOpacity={lit ? 0.9 : 0.35} strokeWidth={i % 6 ? 1 : 1.6} style={{ transition: 'stroke .6s' }} />;
        })}
        <circle cx="100" cy="100" r="82" fill="none" stroke="var(--track)" strokeWidth="10" pathLength={100} strokeDasharray="75 100" strokeLinecap="round" transform="rotate(135 100 100)" />
        <circle
          cx="100" cy="100" r="82" fill="none" stroke={`url(#${gid})`} strokeWidth="10" pathLength={100}
          strokeDasharray={`${75 * shown} 100`} strokeLinecap="round" transform="rotate(135 100 100)"
          className="hud-arc" style={{ filter: `drop-shadow(0 0 6px ${colors[1]})`, opacity: value == null ? 0 : 1 }}
        />
        {value != null && (
          <g className="hud-arc-marker" style={{ transform: `rotate(${135 + 270 * shown}deg)`, transformOrigin: '100px 100px' }}>
            <circle cx="182" cy="100" r="9" fill={colors[1]} className="hud-ping" style={{ transformOrigin: '182px 100px' }} />
            <circle cx="182" cy="100" r="5" fill="#fff" />
          </g>
        )}
      </svg>
      {backdrop && <div className="hud-gauge-backdrop absolute inset-[23%] grid place-items-center pointer-events-none" aria-hidden>{backdrop}</div>}
      <GaugeValue value={value} digits={digits} unit={unit} />
    </GaugeFrame>
  );
}

/** Closed wave shape for the liquid gauge: 600 units wide (6 wavelengths), filled downwards. */
const WAVE = (() => {
  let d = 'M -200 0';
  for (let x = -200; x < 400; x += 100) d += ` Q ${x + 25} -7 ${x + 50} 0 T ${x + 100} 0`;
  return `${d} V 260 H -200 Z`;
})();

/**
 * Round "liquid" gauge (battery): the fill level rises / falls smoothly, two waves move on the
 * surface, and while charging bubbles rise.
 */
export function LiquidGauge({ percent, color, charging, label }: { percent: number | null; color: string; charging: boolean; label?: ReactNode }) {
  const mounted = useMounted();
  const cid = useSvgId('liquid');
  const level = mounted && percent != null ? clamp(percent, 0, 100) : 0;
  // the liquid circle spans y = 24 … 176
  const top = 176 - 152 * (level / 100);
  return (
    <GaugeFrame label={label} style={toneStyle(color)}>
      <svg viewBox="0 0 200 200" className="w-full h-full overflow-visible">
        <defs>
          <clipPath id={cid}>
            <circle cx="100" cy="100" r="76" />
          </clipPath>
        </defs>
        <g className="hud-spin hud-spin-40 hud-spin-rev" style={{ transformOrigin: '100px 100px' }}>
          <circle cx="100" cy="100" r="94" fill="none" stroke="var(--tone)" strokeOpacity="0.4" strokeWidth="1.2" strokeDasharray="10 6 2 6" />
        </g>
        <circle cx="100" cy="100" r="84" fill="none" stroke="var(--tone)" strokeOpacity="0.55" strokeWidth="2" style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
        <g clipPath={`url(#${cid})`}>
          <rect x="0" y="0" width="200" height="200" fill="var(--tone)" opacity="0.07" />
          <g className="hud-liquid" style={{ transform: `translateY(${top}px)` }}>
            <path d={WAVE} fill="var(--tone)" opacity="0.35" className="hud-wave hud-wave-slow" />
            {/* offset via the group: the CSS animation of the path replaces its own transform */}
            <g transform="translate(-50 3)">
              <path d={WAVE} fill="var(--tone)" opacity="0.55" className="hud-wave" />
            </g>
          </g>
          {charging &&
            [38, 62, 84, 110, 132, 156].map((x, i) => (
              <circle key={x} cx={x} cy="182" r={2 + (i % 3)} fill="#fff" opacity="0.7" className="hud-bubble" style={{ animationDelay: `${i * 0.45}s` }} />
            ))}
        </g>
      </svg>
      <GaugeValue value={percent} digits={0} unit="%" />
    </GaugeFrame>
  );
}

/**
 * Ring of segments, one per item (e.g. per lamp). Segments that are on glow in the accent colour,
 * one after another with a slight delay.
 */
export function SegmentRing({ on, total, color, label }: { on: number; total: number; color: string; label?: ReactNode }) {
  const mounted = useMounted();
  const n = Math.max(1, Math.min(total, 36));
  const gap = n > 1 ? Math.min(6, 120 / n) : 0;
  const step = 360 / n;
  const lit = Math.round((on / Math.max(1, total)) * n);
  return (
    <GaugeFrame label={label} style={toneStyle(color)}>
      <svg viewBox="0 0 200 200" className="w-full h-full overflow-visible">
        <g className="hud-spin hud-spin-60" style={{ transformOrigin: '100px 100px' }}>
          <circle cx="100" cy="100" r="95" fill="none" stroke="var(--tone)" strokeOpacity="0.3" strokeWidth="1" strokeDasharray="1 5" />
        </g>
        {Array.from({ length: n }, (_, i) => {
          const from = -90 + i * step + gap / 2;
          const isOn = mounted && i < lit;
          return (
            <path
              key={i}
              d={arcPath(100, 100, 80, from, from + step - gap)}
              fill="none"
              stroke={isOn ? 'var(--tone)' : 'var(--track)'}
              strokeWidth="14"
              strokeLinecap={n > 24 ? 'butt' : 'round'}
              className={isOn ? 'hud-seg-on' : ''}
              style={{ transition: `stroke .5s ${i * 0.06}s`, filter: isOn ? `drop-shadow(0 0 5px ${color})` : undefined, animationDelay: `${i * 0.15}s` }}
            />
          );
        })}
        <circle cx="100" cy="100" r="62" fill="none" stroke="var(--tone)" strokeOpacity="0.18" strokeWidth="1" />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center pointer-events-none">
        <div className="hud-gauge-value text-[1.6rem] sm:text-3xl font-bold tracking-tight leading-none whitespace-nowrap">
          <AnimatedNumber value={on} />
          <span className="text-xs sm:text-sm text-muted font-semibold"> / {total}</span>
        </div>
      </div>
    </GaugeFrame>
  );
}

/**
 * "Home Core": the eye-catcher in the middle of the overview. Rotating rings with ticks and arcs,
 * a radar sweep, orbiting satellites and a pulsing core with the house symbol. Its colour shows the
 * state of the house (OK / warning / alarm).
 */
export function HomeCore({ color, label, sub, size = 'clamp(210px, 64vw, 290px)' }: { color: string; label: string; sub?: string; size?: string }) {
  const gid = useSvgId('core');
  const ticks = Array.from({ length: 72 }, (_, i) => i);
  return (
    <div className="hud-core relative shrink-0 mx-auto" style={{ ...toneStyle(color), width: size, height: size }}>
      <div className="hud-core-sweep" aria-hidden />
      <svg viewBox="0 0 260 260" className="absolute inset-0 w-full h-full overflow-visible" aria-hidden>
        <defs>
          <radialGradient id={gid}>
            <stop offset="0" stopColor={color} stopOpacity="0.95" />
            <stop offset="0.55" stopColor={color} stopOpacity="0.35" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* outer ring with four brackets */}
        <g className="hud-spin hud-spin-60" style={{ transformOrigin: '130px 130px' }}>
          <circle cx="130" cy="130" r="126" fill="none" stroke="var(--tone)" strokeOpacity="0.3" strokeWidth="1" strokeDasharray="2 10" />
          {[0, 90, 180, 270].map((a) => <path key={a} d={arcPath(130, 130, 126, a - 12, a + 12)} fill="none" stroke="var(--tone)" strokeWidth="2.5" strokeLinecap="round" />)}
        </g>
        {/* tick ring, turning the other way */}
        <g className="hud-spin hud-spin-90 hud-spin-rev" style={{ transformOrigin: '130px 130px' }}>
          {ticks.map((i) => {
            const [x1, y1] = polar(130, 130, i % 6 ? 108 : 103, i * 5);
            const [x2, y2] = polar(130, 130, 112, i * 5);
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--tone)" strokeOpacity={i % 6 ? 0.35 : 0.8} strokeWidth="1.2" />;
          })}
        </g>
        {/* three fast arcs */}
        <g className="hud-spin hud-spin-14" style={{ transformOrigin: '130px 130px' }}>
          {[0, 120, 240].map((a) => <path key={a} d={arcPath(130, 130, 94, a, a + 70)} fill="none" stroke="var(--tone)" strokeOpacity="0.75" strokeWidth="3" strokeLinecap="round" />)}
        </g>
        {/* orbit with satellites */}
        <g className="hud-spin hud-spin-9" style={{ transformOrigin: '130px 130px' }}>
          <circle cx="130" cy="130" r="78" fill="none" stroke="var(--tone)" strokeOpacity="0.2" strokeWidth="1" />
          <circle cx="208" cy="130" r="4" fill="var(--tone)" style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
          <circle cx="52" cy="130" r="2.5" fill="var(--tone)" />
          <circle cx="130" cy="52" r="2" fill="#fff" opacity="0.8" />
        </g>
        {/* pulsing core */}
        <circle cx="130" cy="130" r="64" fill={`url(#${gid})`} className="hud-core-pulse" style={{ transformOrigin: '130px 130px' }} />
        <circle cx="130" cy="130" r="46" fill="var(--bg2)" fillOpacity="0.55" stroke="var(--tone)" strokeOpacity="0.7" strokeWidth="1.5" />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center pointer-events-none">
        <div className="flex flex-col items-center leading-tight">
          <House size={30} style={{ color, filter: `drop-shadow(0 0 8px ${color})` }} />
          <div className="mt-1 text-[0.72rem] font-bold uppercase tracking-[0.18em]" style={{ color }}>{label}</div>
          {sub && <div className="text-[0.65rem] text-muted mt-0.5 max-w-[6.5rem]">{sub}</div>}
        </div>
      </div>
    </div>
  );
}
