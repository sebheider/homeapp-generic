/** Gauges of the HUD: count-up number, arc gauge, liquid gauge and segment ring. */
import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { motion, useSpring, useTransform } from 'motion/react';
import { clamp, num } from '../../lib/format';
import { useSvgId } from '../../lib/hooks';
import { toneStyle, useMounted, polar, arcPath } from './shared';

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
