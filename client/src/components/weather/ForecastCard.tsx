import { CloudSun, Umbrella, Wind } from 'lucide-react';
import { num } from '../../lib/format';
import { describeCode, fmtTime, uvLevel } from '../../lib/weather';
import type { WeatherData } from '../../lib/api';
import { MiniWeatherIcon } from '../WeatherIcon';
import { CardTitle } from './shared';

/** Forecast for the next three days with a temperature range bar on a shared scale. */
export function ForecastCard({ web }: { web: WeatherData }) {
  if (web.daily.length < 2) return null;
  return (
    <div className="glass tone-cool p-4 sm:p-5 h-full flex flex-col">
      <CardTitle icon={<CloudSun size={15} />}>Nächste 3 Tage</CardTitle>
      <ForecastContent web={web} />
    </div>
  );
}

/** Content of the forecast card: one row per day. */
export function ForecastContent({ web }: { web: WeatherData }) {
  const days = web.daily.slice(1, 4);
  const tz = web.timezone;
  if (!days.length) return null;
  // common temperature scale of all shown days
  const lo = Math.min(...days.map((d) => d.tMin ?? 99));
  const hi = Math.max(...days.map((d) => d.tMax ?? -99));
  const span = Math.max(1, hi - lo);
  return (
    <div className="flex flex-col gap-3 flex-1 justify-around">
      {days.map((d, i) => {
        const c = describeCode(d.code);
        const left = (((d.tMin ?? lo) - lo) / span) * 100;
        const width = Math.max(8, (((d.tMax ?? hi) - (d.tMin ?? lo)) / span) * 100);
        // `t` is the start of the day; +2 h keeps the formatted weekday / date safely inside that day
        const inDay = d.t + 7200;
        return (
          <div key={d.t} className="rounded-2xl bg-white/5 border border-line p-3">
            <div className="flex items-center gap-3">
              <div className="w-14">
                <div className="font-semibold">{i === 0 ? 'Morgen' : fmtTime(inDay, tz, { weekday: 'short' })}</div>
                <div className="text-[0.7rem] text-muted">{fmtTime(inDay, tz, { day: '2-digit', month: '2-digit' })}</div>
              </div>
              <MiniWeatherIcon kind={c.kind} size={30} color={c.tone} />
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate">{c.label}</div>
                <div className="text-[0.7rem] text-muted flex flex-wrap gap-x-3">
                  {d.pop != null && <span className={`inline-flex items-center gap-1 ${d.pop >= 40 ? 'text-sky-300' : ''}`}><Umbrella size={11} />{d.pop} %{d.precip ? ` · ${num(d.precip, 1)} mm` : ''}</span>}
                  {d.wind != null && <span className="inline-flex items-center gap-1"><Wind size={11} />{num(d.wind, 0)} km/h</span>}
                  {d.uvMax != null && <span style={{ color: uvLevel(d.uvMax).color }}>UV {num(d.uvMax, 0)}</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2 text-sm tabular-nums">
              <span className="w-9 text-right text-sky-300">{d.tMin == null ? '–' : `${num(d.tMin, 0)}°`}</span>
              <div className="relative flex-1 h-1.5 rounded-full bg-white/10">
                <div className="absolute h-full rounded-full" style={{ left: `${left}%`, width: `${width}%`, background: 'linear-gradient(90deg,#38bdf8,#fbbf24,#fb7185)' }} />
              </div>
              <span className="w-9 font-semibold text-orange-300">{d.tMax == null ? '–' : `${num(d.tMax, 0)}°`}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
