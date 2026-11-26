import { Umbrella } from 'lucide-react';
import { num } from '../../lib/format';
import { fmtDuration, fmtTime } from '../../lib/weather';
import type { WeatherData } from '../../lib/api';
import { RadarMap } from '../RadarMap';
import { useNowSec, hourLabel, CardTitle, BarColumn } from './shared';

/** Minimum precipitation per 15 minutes (mm) that counts as rain. */
const WET_MM = 0.05;

/** One-line rain outlook from the 15-minute nowcast (falls back to today's probability without nowcast). */
function rainSummary(nc: WeatherData['nowcast'], web: WeatherData, nowSec: number) {
  const tz = web.timezone;
  const wet = (i: number) => (nc[i]?.precip ?? 0) >= WET_MM;
  const first = nc.findIndex((_, i) => wet(i));
  if (!nc.length) return web.daily[0]?.pop != null ? `Regenwahrscheinlichkeit heute ${web.daily[0].pop} %` : 'Keine Kurzfristprognose verfügbar';
  if (first === -1) return `Kein Regen in den nächsten ${Math.round((nc.length * 15) / 60)} Stunden erwartet`;
  if (first === 0) {
    const dry = nc.findIndex((_, i) => i > 0 && !wet(i));
    return dry === -1 ? `Es regnet, voraussichtlich mindestens bis ${fmtTime(nc[nc.length - 1].t + 900, tz)} Uhr` : `Es regnet, voraussichtlich bis ${fmtTime(nc[dry].t, tz)} Uhr`;
  }
  return `Regen ab ${fmtTime(nc[first].t, tz)} Uhr (in ${fmtDuration(nc[first].t - nowSec)})`;
}

/** Rain outlook: summary sentence, 15-minute precipitation bars and (optionally) the radar map. */
export function RainCard({ web, radar, lat, lon }: { web: WeatherData; radar: boolean; lat: number | null; lon: number | null }) {
  return (
    <div className="glass tone-cool p-4 sm:p-5 h-full">
      <CardTitle icon={<Umbrella size={15} />}>Regen</CardTitle>
      <RainContent web={web} />
      {radar && lat != null && lon != null && <div className="mt-4"><RadarMap lat={lat} lon={lon} tz={web.timezone} /></div>}
    </div>
  );
}

/** Rain summary sentence and the 15-minute precipitation bars. */
export function RainContent({ web }: { web: WeatherData }) {
  const nowSec = useNowSec();
  const tz = web.timezone;
  // nowcast from the current quarter hour on
  const nc = web.nowcast.filter((x) => x.t >= nowSec - 900);
  const summary = rainSummary(nc, web, nowSec);
  const max = Math.max(0.5, ...nc.map((x) => x.precip));

  return (
    <div>
      <p className="font-semibold mb-3">{summary}</p>
      {nc.length > 0 && (
        <div className="flex items-stretch gap-1 h-20" aria-label="Niederschlag in den nächsten Stunden">
          {nc.map((x) => (
            <BarColumn
              key={x.t}
              fraction={x.precip / max}
              color={x.precip >= WET_MM ? '#38bdf8' : 'var(--line)'}
              label={x.t % 3600 === 0 ? hourLabel(x.t, tz) : ''}
              title={`${fmtTime(x.t, tz)} Uhr: ${num(x.precip * 4, 1)} mm/h`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
