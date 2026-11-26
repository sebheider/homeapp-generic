/** Main card of the weather page: condition, temperature, current values, hourly forecast and temperature curve. */
import { useMemo, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, CloudSun, Droplets, Gauge, MapPin, Sun, Umbrella, Wind } from 'lucide-react';
import { useStore } from '../../lib/store';
import { useMedia } from '../../lib/hooks';
import { num, numOrDash } from '../../lib/format';
import { compass, describeCode, fmtTime, windWord, type LocalWeather } from '../../lib/weather';
import type { WeatherData } from '../../lib/api';
import { AreaChart, Legend, useHistory, type ChartSeries } from '../Charts';
import { MiniWeatherIcon, WeatherIcon } from '../WeatherIcon';
import { pick, dewPointVal, SrcDot, type Src, type Val } from './shared';

/** Small value box of the hero card (with source dot). */
function Metric({ icon, label, value, unit, sub, src }: { icon: ReactNode; label: string; value: ReactNode; unit?: string; sub?: ReactNode; src: Src }) {
  return (
    <div className="rounded-2xl bg-white/5 border border-line px-3 py-2.5 min-w-0">
      <div className="flex items-center gap-1.5 text-xs text-muted">{icon}<span className="truncate">{label}</span><span className="ml-auto"><SrcDot src={src} /></span></div>
      <div className="text-lg font-bold tabular-nums leading-tight mt-0.5">{value}{unit && <span className="text-xs font-medium text-muted ml-1">{unit}</span>}</div>
      {sub && <div className="text-[0.7rem] text-muted truncate">{sub}</div>}
    </div>
  );
}

/** Grid of the current values (humidity, wind, pressure, rain, brightness, clouds); only available values are shown. */
export function HeroMetrics({ web, local, temp }: { web: WeatherData | null; local: LocalWeather; temp: Val }) {
  const cur = web?.current;
  const hum = pick(local.humidity, cur?.humidity);
  const press = pick(local.pressure, cur?.pressure);
  const wind = pick(local.windSpeed, cur?.wind);
  const gust = pick(local.windGust, cur?.gust);
  const dir = pick(local.windDir, cur?.windDir);
  const dew = dewPointVal(local, temp, hum);
  const rainToday = pick(local.rainToday, web?.daily[0]?.precip);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 flex-1 min-w-[min(100%,26rem)]">
      {hum.v != null && <Metric icon={<Droplets size={13} />} label="Luftfeuchte" value={num(hum.v, 0)} unit="%" src={hum.src} sub={dew.v != null ? `Taupunkt ${num(dew.v, 1)} °C` : undefined} />}
      {wind.v != null && (
        <Metric
          icon={<Wind size={13} />}
          label="Wind"
          value={
            <span className="inline-flex items-center gap-1.5">
              {num(wind.v, 0)}
              {/* the arrow points where the wind blows to (direction + 180°) */}
              {dir.v != null && <ArrowUp size={14} className="text-sky-300" style={{ transform: `rotate(${dir.v + 180}deg)` }} />}
            </span>
          }
          unit="km/h"
          src={wind.src}
          sub={`${windWord(wind.v)}${dir.v != null ? ` · ${compass(dir.v)}` : ''}${gust.v != null && gust.v > wind.v ? ` · Böen ${num(gust.v, 0)}` : ''}`}
        />
      )}
      {press.v != null && <Metric icon={<Gauge size={13} />} label="Luftdruck" value={num(press.v, 0)} unit="hPa" src={press.src} />}
      {rainToday.v != null && <Metric icon={<Umbrella size={13} />} label={rainToday.src === 'local' ? 'Regen heute' : 'Regen heute (Prognose)'} value={num(rainToday.v, 1)} unit="mm" src={rainToday.src} sub={local.rainLastHour !== undefined ? `letzte Stunde ${num(local.rainLastHour, 1)} mm` : undefined} />}
      {local.lux !== undefined && <Metric icon={<Sun size={13} />} label="Helligkeit" value={num(local.lux, 0)} unit="lx" src="local" />}
      {cur?.cloud != null && <Metric icon={<CloudSun size={13} />} label="Bewölkung" value={num(cur.cloud, 0)} unit="%" src="web" />}
    </div>
  );
}

/** Horizontally scrollable forecast of the next 24 hours. */
export function HourlyStrip({ web, nowSec }: { web: WeatherData | null; nowSec: number }) {
  const tz = web?.timezone ?? 'UTC';
  const hours = useMemo(() => (web?.hourly ?? []).filter((h) => h.t > nowSec - 3600).slice(0, 25), [web, nowSec]);
  if (!hours.length) return null;
  return (
    <div className="flex gap-1 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
      {hours.map((h, i) => {
        const c = describeCode(h.code);
        return (
          <div key={h.t} className={`flex flex-col items-center gap-1 rounded-2xl px-2.5 py-2 min-w-[3.7rem] ${i === 0 ? 'bg-white/10 border border-line' : ''}`}>
            <span className="text-[0.7rem] text-muted">{i === 0 ? 'Jetzt' : fmtTime(h.t, tz)}</span>
            <MiniWeatherIcon kind={c.kind} isDay={h.isDay} color={c.tone} />
            <span className="text-sm font-semibold tabular-nums">{h.temp == null ? '–' : `${num(h.temp, 0)}°`}</span>
            {/* precipitation probability is only highlighted from 20 %; the transparent text keeps the columns aligned */}
            <span className={`text-[0.65rem] tabular-nums ${h.pop != null && h.pop >= 20 ? 'text-sky-300' : 'text-transparent'}`}>{h.pop ?? 0}%</span>
          </div>
        );
      })}
    </div>
  );
}

/** Temperature curve: measured values of the last 24 h (local sensor) plus the forecast of the next 24 h. */
export function TemperatureChart({ web, nowSec }: { web: WeatherData | null; nowSec: number }) {
  const tempId = useStore((s) => s.config?.weather?.states?.temperature);
  const { data: hist } = useHistory(tempId ? [tempId] : [], 24);
  const measured = tempId ? hist[tempId] ?? [] : [];
  const series = useMemo(() => {
    const out: ChartSeries[] = [];
    if (measured.length > 1) out.push({ id: 'wx-meas', label: 'Gemessen', color: '#34d399', data: measured });
    // without measured history the forecast also shows the last 6 hours
    const fc = (web?.hourly ?? []).filter((h) => h.temp != null && h.t >= nowSec - (measured.length > 1 ? 0 : 6 * 3600) && h.t <= nowSec + 24 * 3600).map((h) => [h.t * 1000, h.temp as number] as [number, number]);
    if (fc.length > 1) out.push({ id: 'wx-fc', label: 'Prognose', color: '#38bdf8', data: fc, line: true });
    return out;
  }, [measured, web, nowSec]);

  if (!series.length) return null;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-1">
        <span className="section-title">Temperaturverlauf</span>
        <Legend items={series} />
      </div>
      <AreaChart series={series} height={120} unit="°C" autoMin format={(v) => num(v, 1)} />
    </div>
  );
}

/** Main card: condition icon, temperature, current values, hourly strip, temperature curve and source legend. */
export function Hero({ web, local, nowSec, name }: { web: WeatherData | null; local: LocalWeather; nowSec: number; name: string }) {
  const cur = web?.current;
  const today = web?.daily[0];
  const cond = describeCode(cur?.code);
  const isDay = cur?.isDay ?? true;
  const tz = web?.timezone ?? 'UTC';
  const temp = pick(local.temperature, cur?.temp);
  const feels = pick(local.feelsLike, cur?.feelsLike);
  // the symbol is the eye-catcher of the page; on phones it stays small enough to fit next to the temperature
  const iconSize = useMedia('(min-width: 40rem)') ? 160 : 124;

  return (
    <div className="glass tone-cool relative overflow-hidden p-4 sm:p-6 h-full flex flex-col gap-5" style={{ ['--tone' as string]: cond.tone }}>
      <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
        <div className="flex items-center gap-4 sm:gap-5">
          <div>
            <WeatherIcon kind={web ? cond.kind : 'partly'} isDay={isDay} size={iconSize} code={cur?.code} wind={local.windSpeed ?? cur?.wind} temp={temp.v} />
          </div>
          <div>
            {name && <div className="text-xs text-muted flex items-center gap-1 mb-0.5"><MapPin size={12} />{name}</div>}
            <div className="flex items-start leading-none">
              <span className="text-6xl sm:text-7xl font-bold tabular-nums tracking-tight">{numOrDash(temp.v, 1)}</span>
              <span className="text-2xl text-muted mt-1 ml-1">°C</span>
              <span className="mt-2 ml-2"><SrcDot src={temp.src} /></span>
            </div>
            <div className="text-lg font-semibold mt-1">{web ? cond.label : 'Lokale Wetterstation'}</div>
            <div className="text-sm text-muted flex flex-wrap gap-x-3">
              {feels.v != null && <span>Gefühlt {num(feels.v, 1)}°</span>}
              {today?.tMax != null && today.tMin != null && (
                <span className="inline-flex items-center gap-1"><ArrowUp size={13} />{num(today.tMax, 0)}° <ArrowDown size={13} />{num(today.tMin, 0)}°</span>
              )}
            </div>
          </div>
        </div>

        <HeroMetrics web={web} local={local} temp={temp} />
      </div>

      <HourlyStrip web={web} nowSec={nowSec} />
      <TemperatureChart web={web} nowSec={nowSec} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.7rem] text-muted mt-auto">
        <span className="inline-flex items-center gap-1.5"><SrcDot src="local" /> Lokale Wetterstation</span>
        <span className="inline-flex items-center gap-1.5"><SrcDot src="web" /> Internet (Open-Meteo)</span>
        {web && <span className="ml-auto">Stand {fmtTime(web.fetchedAt / 1000, tz)} Uhr{web.stale ? ' · Internet nicht erreichbar, alte Daten' : ''}{web.demo ? ' · Demo' : ''}</span>}
      </div>
    </div>
  );
}
