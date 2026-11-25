/**
 * History charts: the `useHistory` data hook and a small dependency-free SVG area / line chart.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { clockTime } from '../lib/format';
import { useElementSize } from '../lib/hooks';
import type { Series } from '../lib/types';

/**
 * Loads time series for a set of state ids and refreshes them periodically.
 * The ids are joined into a key so that a new array instance with the same
 * content does not trigger a reload.
 */
export function useHistory(ids: string[], hours: number, refreshMs = 60000) {
  const key = ids.join(',');
  const [data, setData] = useState<Record<string, Series>>({});
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!ids.length) {
      setData({});
      setLoading(false);
      return;
    }
    let alive = true;
    const load = () =>
      api
        .history(ids, hours)
        .then((d) => alive && (setData(d), setLoading(false)))
        .catch(() => alive && setLoading(false));
    load();
    const t = setInterval(load, refreshMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [key, hours, refreshMs]);
  return { data, loading };
}

/** Colour legend of chart series (dot + label). */
export function Legend({ items, className = '' }: { items: Pick<ChartSeries, 'id' | 'label' | 'color'>[]; className?: string }) {
  return (
    <div className={`flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted ${className}`}>
      {items.map((s) => (
        <span key={s.id} className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />{s.label}</span>
      ))}
    </div>
  );
}

/** One line / area of an `AreaChart`. */
export interface ChartSeries {
  id: string;
  label: string;
  color: string;
  data: Series;
  /** Draws the series as filled area (default) or only as a line. */
  line?: boolean;
}

interface Props {
  series: ChartSeries[];
  height?: number;
  unit?: string;
  /** Compact mode: no axes or tooltip, used for small sparkline cards. */
  compact?: boolean;
  format?: (v: number) => string;
  /** Axis starts at the lowest value instead of at 0 (e.g. for temperatures). */
  autoMin?: boolean;
}

/** Id of the fill gradient of a series (ids may contain characters that are invalid in `url(#…)`). */
const gradientId = (s: ChartSeries) => `g-${s.id.replace(/\W/g, '')}`;

/** Data point of a series closest to time `t`. */
const valueAt = (s: ChartSeries, t: number) => {
  let best = s.data[0];
  for (const p of s.data) if (Math.abs(p[0] - t) < Math.abs(best[0] - t)) best = p;
  return best;
};

/** Dependency-free responsive SVG area/line chart with a hover tooltip. */
export function AreaChart({ series, height = 220, unit = '', compact = false, format, autoMin = false }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  // The SVG is drawn in real pixels so text and strokes are never distorted
  const W = Math.max(120, useElementSize(wrap, { w: 640, h: 0 }).w);
  const H = compact ? 56 : height;
  const padL = compact ? 0 : 44;
  const padR = compact ? 0 : 8;
  const padT = compact ? 4 : 10;
  const padB = compact ? 4 : 24;

  const geo = useMemo(() => {
    const pts = series.flatMap((s) => s.data);
    if (!pts.length) return null;
    const t0 = Math.min(...pts.map((p) => p[0]));
    const t1 = Math.max(...pts.map((p) => p[0]));
    let lo = autoMin ? Math.min(...pts.map((p) => p[1])) : Math.min(0, ...pts.map((p) => p[1]));
    let hi = Math.max(...pts.map((p) => p[1]));
    if (hi - lo < 1e-6) hi = lo + 1;
    // round the axis to a pleasant step
    const step = niceStep((hi - lo) / 4);
    hi = Math.ceil(hi / step) * step;
    lo = Math.floor(lo / step) * step;
    const x = (t: number) => padL + ((t - t0) / (t1 - t0 || 1)) * (W - padL - padR);
    const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
    return { t0, t1, lo, hi, step, x, y };
  }, [series, H, W, autoMin]);

  if (!geo) {
    return <div ref={wrap} className="grid place-items-center text-sm text-muted" style={{ height: compact ? 56 : height }}>Noch keine Verlaufsdaten</div>;
  }
  const { t0, t1, lo, hi, step, x, y } = geo;
  const fmt = format || ((v: number) => `${Math.round(v * 10) / 10}`);
  const now = Date.now();

  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(v);

  // hour labels on the time axis: every hour, every 3 h or every 6 h depending on the span
  const hoursTicks: number[] = [];
  const span = t1 - t0;
  const every = span > 30 * 3600e3 ? 6 : span > 12 * 3600e3 ? 3 : 1;
  const d0 = new Date(t0);
  d0.setMinutes(0, 0, 0);
  for (let t = d0.getTime() + 3600e3; t < t1; t += 3600e3) {
    if (new Date(t).getHours() % every === 0) hoursTicks.push(t);
  }

  // converts the pointer position to a time on the x axis
  const onMove = (e: React.PointerEvent) => {
    if (compact || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const t = t0 + ((px - padL) / (W - padL - padR)) * (t1 - t0);
    setHover(Math.min(t1, Math.max(t0, t)));
  };

  return (
    <div ref={wrap} className="relative" style={{ height: H }}>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="block overflow-visible touch-pan-y"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          {series.map((s) => (
            <linearGradient key={s.id} id={gradientId(s)} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={s.color} stopOpacity="0.45" />
              <stop offset="1" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {!compact &&
          ticks.map((v) => (
            <g key={v}>
              <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray={v === 0 ? '0' : '3 5'} vectorEffect="non-scaling-stroke" />
              <text x={padL - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{fmt(v)}</text>
            </g>
          ))}
        {!compact &&
          hoursTicks.map((t) => (
            <text key={t} x={x(t)} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--muted)">
              {clockTime(t)}
            </text>
          ))}
        {series.map((s) => {
          if (s.data.length < 2) return null;
          const line = s.data.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(' ');
          // close the line down to the zero line (or the axis minimum) to get the filled area
          const last = s.data[s.data.length - 1];
          const area = `${line} L${x(last[0]).toFixed(1)} ${y(Math.max(lo, 0)).toFixed(1)} L${x(s.data[0][0]).toFixed(1)} ${y(Math.max(lo, 0)).toFixed(1)}Z`;
          return (
            <g key={s.id}>
              {!s.line && <path className="chart-area" d={area} fill={`url(#${gradientId(s)})`} />}
              {/* drawn in real pixels, so no non-scaling stroke is needed (it would break the dash-based draw-in) */}
              <path className="chart-line" pathLength={1} d={line} fill="none" stroke={s.color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
              {/* only measured values are "live", not forecasts that end in the future */}
              {!compact && last[0] <= now + 5 * 60e3 && <LiveDot x={x(last[0])} y={y(last[1])} color={s.color} />}
            </g>
          );
        })}
        {hover !== null && !compact && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke="var(--muted)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
            {series.map((s) => s.data.length > 0 && <circle key={s.id} cx={x(valueAt(s, hover)[0])} cy={y(valueAt(s, hover)[1])} r="4" fill={s.color} stroke="#fff" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />)}
          </g>
        )}
      </svg>
      {hover !== null && !compact && (
        <div
          className="absolute top-0 pointer-events-none glass !rounded-xl px-3 py-2 text-xs whitespace-nowrap z-10"
          style={{ left: `${(x(hover) / W) * 100}%`, transform: `translateX(${x(hover) / W > 0.7 ? '-105%' : '8%'})`, background: 'color-mix(in srgb, var(--bg2) 90%, transparent)' }}
        >
          <div className="text-muted mb-1">{clockTime(hover)}</div>
          {series.map((s) => s.data.length > 0 && (
            <div key={s.id} className="flex items-center gap-2">
              <i className="w-2 h-2 rounded-full" style={{ background: s.color }} />
              <span>{s.label}</span>
              <b className="ml-auto pl-3 tabular-nums">{fmt(valueAt(s, hover)[1])} {unit}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Marker of the latest value of a series with a slowly fading ring. */
function LiveDot({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g pointerEvents="none">
      <circle className="chart-live" cx={x} cy={y} r="3.5" fill={color} />
      <circle cx={x} cy={y} r="3.5" fill={color} stroke="var(--bg2)" strokeWidth="1.5" />
    </g>
  );
}

/** Picks a 1/2/5 * 10^n step for axis ticks. */
function niceStep(raw: number) {
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
