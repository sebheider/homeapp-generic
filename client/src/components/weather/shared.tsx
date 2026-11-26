/** Building blocks shared by the weather cards: value sources, small helpers, card heading and bar column. */
import type { ReactNode } from 'react';
import { useNow } from '../../lib/hooks';
import { clamp } from '../../lib/format';
import { fmtTime, type LocalWeather } from '../../lib/weather';

/** Source of a value: local weather station, internet forecast, or none. */
export type Src = 'local' | 'web' | null;
/** A value together with its source. */
export interface Val {
  v: number | null;
  src: Src;
}

const NONE: Val = { v: null, src: null };

/** Prefers the local station value and falls back to the internet value. */
export const pick = (local: number | undefined, web: number | null | undefined): Val =>
  local !== undefined ? { v: local, src: 'local' } : web != null ? { v: web, src: 'web' } : NONE;

/** Seconds since 1970, refreshed every minute so sun position and "now" markers stay current. */
export const useNowSec = () => Math.floor(useNow(60000) / 1000);

/** Hour of day as a bare number for chart axes ("14"). */
export const hourLabel = (sec: number, tz: string) => fmtTime(sec, tz, { hour: '2-digit' }).replace(/\s*Uhr/, '');

/** Dew point (Magnus formula) for stations that do not report it. */
const dewPoint = (t: number, rh: number) => {
  const g = Math.log(Math.max(rh, 1) / 100) + (17.62 * t) / (243.12 + t);
  return (243.12 * g) / (17.62 - g);
};

/** Dew point: measured locally, otherwise computed from temperature and humidity (local only if both are local). */
export function dewPointVal(local: LocalWeather, temp: Val, hum: Val): Val {
  if (local.dewPoint !== undefined) return { v: local.dewPoint, src: 'local' };
  if (temp.v == null || hum.v == null) return NONE;
  return { v: dewPoint(temp.v, hum.v), src: temp.src === 'local' && hum.src === 'local' ? 'local' : 'web' };
}

const SRC_COLOR = { local: '#34d399', web: '#38bdf8' } as const;

/** Coloured dot that marks where a value comes from. */
export function SrcDot({ src }: { src: Src }) {
  if (!src) return null;
  return <i className="inline-block w-1.5 h-1.5 rounded-full align-middle" style={{ background: SRC_COLOR[src] }} title={src === 'local' ? 'Lokale Wetterstation' : 'Internet (Open-Meteo)'} />;
}

/** Heading of a weather card with icon and optional element on the right. */
export function CardTitle({ icon, children, right }: { icon: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h2 className="section-title flex items-center gap-2">{icon}{children}</h2>
      {right}
    </div>
  );
}

/** One column of a small bar chart: fixed rows for value, bar and label so all bars share one baseline. */
export function BarColumn({ value, fraction, color, label, title, opacity = 1 }: { value?: string; fraction: number; color: string; label?: string; title: string; opacity?: number }) {
  return (
    <div className="flex-1 min-w-0 flex flex-col items-center h-full" title={title}>
      <span className="h-4 text-[0.6rem] leading-4 tabular-nums text-muted">{value ?? ''}</span>
      <div className="flex-1 w-full flex items-end">
        <div className="w-full rounded-t-md" style={{ background: color, opacity, minHeight: 3, height: `${Math.max(4, clamp(fraction, 0, 1) * 100)}%` }} />
      </div>
      <span className="h-4 text-[0.6rem] leading-4 tabular-nums text-muted whitespace-nowrap">{label ?? ''}</span>
    </div>
  );
}
