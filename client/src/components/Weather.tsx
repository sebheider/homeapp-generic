/**
 * Weather block of the weather page.
 *
 * Combines the internet forecast (Open-Meteo, via the server) with the local weather station
 * (ioBroker datapoints): for current values the local sensor wins, the internet fills the gaps.
 * A small dot next to each value shows where it comes from.
 *
 * Cards: current conditions + hourly strip + temperature curve, sun path (sunrise / sunset),
 * UV index with the next hours, 3-day forecast, rain (nowcast + animated radar). `WeatherPart` shows
 * one of these parts as a widget of the own start page.
 */
import { useMemo, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, CloudSun, Droplets, Gauge, MapPin, RefreshCw, Sun, Sunrise, Sunset, Thermometer, Umbrella, Wind } from 'lucide-react';
import { useStore } from '../lib/store';
import { useNow } from '../lib/hooks';
import { num, numOrDash, clamp } from '../lib/format';
import { compass, describeCode, fmtDuration, fmtTime, useLocalWeather, useWeatherData, uvChartHours, uvLevel, windWord, type LocalWeather } from '../lib/weather';
import type { WeatherData } from '../lib/api';
import { AreaChart, Legend, useHistory, type ChartSeries } from './Charts';
import { MiniWeatherIcon, WeatherIcon } from './WeatherIcon';
import { RadarMap } from './RadarMap';
import { HudPanel } from './Hud';

/** Source of a value: local weather station, internet forecast, or none. */
type Src = 'local' | 'web' | null;
/** A value together with its source. */
interface Val {
  v: number | null;
  src: Src;
}

const NONE: Val = { v: null, src: null };

/** Prefers the local station value and falls back to the internet value. */
const pick = (local: number | undefined, web: number | null | undefined): Val =>
  local !== undefined ? { v: local, src: 'local' } : web != null ? { v: web, src: 'web' } : NONE;

/** Seconds since 1970, refreshed every minute so sun position and "now" markers stay current. */
const useNowSec = () => Math.floor(useNow(60000) / 1000);

/** Hour of day as a bare number for chart axes ("14"). */
const hourLabel = (sec: number, tz: string) => fmtTime(sec, tz, { hour: '2-digit' }).replace(/\s*Uhr/, '');

/** Dew point (Magnus formula) for stations that do not report it. */
const dewPoint = (t: number, rh: number) => {
  const g = Math.log(Math.max(rh, 1) / 100) + (17.62 * t) / (243.12 + t);
  return (243.12 * g) / (17.62 - g);
};

/** Dew point: measured locally, otherwise computed from temperature and humidity (local only if both are local). */
function dewPointVal(local: LocalWeather, temp: Val, hum: Val): Val {
  if (local.dewPoint !== undefined) return { v: local.dewPoint, src: 'local' };
  if (temp.v == null || hum.v == null) return NONE;
  return { v: dewPoint(temp.v, hum.v), src: temp.src === 'local' && hum.src === 'local' ? 'local' : 'web' };
}

const SRC_COLOR = { local: '#34d399', web: '#38bdf8' } as const;

/** Coloured dot that marks where a value comes from. */
function SrcDot({ src }: { src: Src }) {
  if (!src) return null;
  return <i className="inline-block w-1.5 h-1.5 rounded-full align-middle" style={{ background: SRC_COLOR[src] }} title={src === 'local' ? 'Lokale Wetterstation' : 'Internet (Open-Meteo)'} />;
}

/** Heading of a weather card with icon and optional element on the right. */
function CardTitle({ icon, children, right }: { icon: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h2 className="section-title flex items-center gap-2">{icon}{children}</h2>
      {right}
    </div>
  );
}

/* ------------------------------------------------------------------- hero */

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
function HeroMetrics({ web, local, temp }: { web: WeatherData | null; local: LocalWeather; temp: Val }) {
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
function HourlyStrip({ web, nowSec }: { web: WeatherData | null; nowSec: number }) {
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
function TemperatureChart({ web, nowSec }: { web: WeatherData | null; nowSec: number }) {
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
function Hero({ web, local, nowSec, name }: { web: WeatherData | null; local: LocalWeather; nowSec: number; name: string }) {
  const cur = web?.current;
  const today = web?.daily[0];
  const cond = describeCode(cur?.code);
  const isDay = cur?.isDay ?? true;
  const tz = web?.timezone ?? 'UTC';
  const temp = pick(local.temperature, cur?.temp);
  const feels = pick(local.feelsLike, cur?.feelsLike);

  return (
    <div className="glass tone-cool relative overflow-hidden p-4 sm:p-6 h-full flex flex-col gap-5" style={{ ['--tone' as string]: cond.tone }}>
      <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
        <div className="flex items-center gap-4 sm:gap-5">
          <div>
            <WeatherIcon kind={web ? cond.kind : 'partly'} isDay={isDay} size={112} code={cur?.code} wind={local.windSpeed ?? cur?.wind} />
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

/* -------------------------------------------------------------------- sun */

/** Sun path between sunrise and sunset with the current sun position, day length and time to the next sunrise / sunset. */
function SunCard({ web, nowSec }: { web: WeatherData; nowSec: number }) {
  if (!web.daily[0]?.sunrise || !web.daily[0].sunset) return null;
  return (
    <div className="glass tone-energy p-4 sm:p-5 h-full">
      <CardTitle icon={<Sunrise size={15} />}>Sonne</CardTitle>
      <SunContent web={web} nowSec={nowSec} />
    </div>
  );
}

/** Content of the sun card (also a widget of the own start page). */
function SunContent({ web, nowSec }: { web: WeatherData; nowSec: number }) {
  const d0 = web.daily[0];
  const d1 = web.daily[1];
  const tz = web.timezone;
  if (!d0?.sunrise || !d0.sunset) return null;
  const { sunrise, sunset } = d0;
  const prog = clamp((nowSec - sunrise) / (sunset - sunrise), 0, 1);
  const up = nowSec >= sunrise && nowSec <= sunset;
  // point on the half ellipse (centre 150/125, radii 120/95) for a day progress of 0..1
  const point = (p: number) => ({ x: 150 - 120 * Math.cos(Math.PI * p), y: 125 - 95 * Math.sin(Math.PI * p) });
  const sun = point(prog);
  const ARC = 'M30 125A120 95 0 0 1 270 125';
  const status = up
    ? `Noch ${fmtDuration(sunset - nowSec)} Tageslicht`
    : `Sonnenaufgang in ${fmtDuration((nowSec < sunrise ? sunrise : d1?.sunrise ?? sunrise + 86400) - nowSec)}`;

  return (
    <div>
      <svg viewBox="0 0 300 140" className="w-full max-w-sm mx-auto" aria-hidden>
        <defs>
          <linearGradient id="sun-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fbbf24" stopOpacity=".28" />
            <stop offset="1" stopColor="#fbbf24" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="sun-dot" cx="35%" cy="30%" r="80%">
            <stop offset="0" stopColor="#fef3c7" />
            <stop offset="1" stopColor="#f59e0b" />
          </radialGradient>
        </defs>
        <path d={`${ARC}Z`} fill="url(#sun-fill)" opacity={up ? 1 : 0.35} />
        <path d={ARC} fill="none" stroke="var(--line)" strokeWidth="2.5" strokeDasharray="2 7" strokeLinecap="round" />
        <path d={ARC} fill="none" stroke="#fbbf24" strokeWidth="3.5" strokeLinecap="round" pathLength={1} strokeDasharray={`${prog} 1`} />
        <line x1="10" y1="125" x2="290" y2="125" stroke="var(--line)" strokeWidth="1.5" />
        <g opacity={up ? 1 : 0.45}>
          <circle cx={sun.x} cy={sun.y} r="16" fill="#fbbf24" opacity=".25" className="anim-breathe" />
          <circle cx={sun.x} cy={sun.y} r="9" fill="url(#sun-dot)" stroke="#fff" strokeOpacity=".7" strokeWidth="1.5" />
        </g>
      </svg>
      <div className="grid grid-cols-3 text-center gap-2 -mt-1">
        <div>
          <Sunrise size={18} className="mx-auto text-amber-300" />
          <div className="font-bold tabular-nums">{fmtTime(sunrise, tz)}</div>
          <div className="text-[0.7rem] text-muted">Aufgang</div>
        </div>
        <div>
          <div className="text-xs text-muted mt-1">Tageslänge</div>
          <div className="font-semibold tabular-nums text-sm">{fmtDuration(d0.daylight ?? sunset - sunrise)}</div>
        </div>
        <div>
          <Sunset size={18} className="mx-auto text-orange-400" />
          <div className="font-bold tabular-nums">{fmtTime(sunset, tz)}</div>
          <div className="text-[0.7rem] text-muted">Untergang</div>
        </div>
      </div>
      <p className="text-xs text-muted text-center mt-3">{status}</p>
    </div>
  );
}

/* --------------------------------------------------------------------- uv */

const UV_SCALE = 'linear-gradient(90deg,#34d399 0%,#34d399 25%,#facc15 25%,#facc15 50%,#fb923c 50%,#fb923c 67%,#f43f5e 67%,#f43f5e 92%,#a855f7 92%)';

/** One column of a small bar chart: fixed rows for value, bar and label so all bars share one baseline. */
function BarColumn({ value, fraction, color, label, title, opacity = 1 }: { value?: string; fraction: number; color: string; label?: string; title: string; opacity?: number }) {
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

type HourlyEntry = WeatherData['hourly'][number];

/** UV index: always the online forecast for the configured location (not the local sensor). */
function UvCard({ web, nowSec }: { web: WeatherData; nowSec: number }) {
  return (
    <div className="glass tone-violet p-4 sm:p-5 h-full">
      <CardTitle icon={<Sun size={15} />} right={<SrcDot src={web.current.uv == null ? null : 'web'} />}>UV-Index</CardTitle>
      <UvContent web={web} nowSec={nowSec} />
    </div>
  );
}

/** Content of the UV card: current value with scale, the next hours and the sun protection advice. */
function UvContent({ web, nowSec }: { web: WeatherData; nowSec: number }) {
  const tz = web.timezone;
  const cur = web.current.uv;
  const level = uvLevel(cur);
  const [d0, d1] = web.daily;
  const hourly = web.hourly.filter((h) => h.uv != null);
  const today = d0 ? hourly.filter((h) => h.t >= d0.t && h.t < d0.t + 86400) : [];
  // hours that need sun protection (UV 3 and more) and the daily peak
  const strong = today.filter((h) => (h.uv ?? 0) >= 3);
  const peak = today.reduce<HourlyEntry | null>((m, h) => (!m || (h.uv ?? 0) > (m.uv ?? 0) ? h : m), null);

  const { shown, tomorrow } = uvChartHours(hourly, d1, nowSec);
  // bars use the strongest shown value (at least 3, the sun protection threshold) so that low values stay visible
  const barMax = Math.max(3, ...shown.map((h) => h.uv ?? 0));
  const currentHour = hourly.filter((h) => h.t <= nowSec).pop()?.t;
  const advice = strong.length
    ? `Sonnenschutz heute von ${fmtTime(strong[0].t, tz)} bis ${fmtTime(strong[strong.length - 1].t + 3600, tz)} Uhr`
    : 'Heute ist kein Sonnenschutz nötig.';

  return (
    <div>
      <div className="flex items-end gap-3">
        <span className="text-5xl font-bold tabular-nums leading-none" style={{ color: level.color }}>{numOrDash(cur, 1)}</span>
        <div className="pb-1">
          <div className="font-semibold" style={{ color: level.color }}>{level.label}</div>
          {peak && <div className="text-xs text-muted">Maximum heute {num(peak.uv ?? 0, 1)} um {fmtTime(peak.t, tz)} Uhr</div>}
        </div>
      </div>
      {/* colour scale with a marker at the current value (scale ends at UV 12) */}
      <div className="relative h-2 rounded-full mt-4" style={{ background: UV_SCALE }}>
        <span className="absolute -top-1 w-4 h-4 rounded-full bg-white border-2 shadow" style={{ borderColor: level.color, left: `calc(${clamp((cur ?? 0) / 12, 0, 1) * 100}% - 8px)` }} />
      </div>

      {shown.length > 0 && (
        <>
          <div className="text-[0.7rem] text-muted mt-4">{tomorrow ? 'Prognose für morgen' : 'Prognose der nächsten Stunden'}</div>
          <div className="flex items-stretch gap-1 h-28 mt-1">
            {shown.map((h, i) => (
              <BarColumn
                key={h.t}
                value={(h.uv ?? 0) >= 0.5 ? num(h.uv ?? 0, 0) : ''}
                fraction={(h.uv ?? 0) / barMax}
                color={uvLevel(h.uv).color}
                opacity={h.t === currentHour ? 1 : 0.7}
                label={i % 2 === 0 ? hourLabel(h.t, tz) : ''}
                title={`${fmtTime(h.t, tz)} Uhr: UV ${num(h.uv ?? 0, 1)}`}
              />
            ))}
          </div>
        </>
      )}
      <p className="text-xs text-muted mt-3">{advice}</p>
    </div>
  );
}

/* --------------------------------------------------------------- forecast */

/** Forecast for the next three days with a temperature range bar on a shared scale. */
function ForecastCard({ web }: { web: WeatherData }) {
  if (web.daily.length < 2) return null;
  return (
    <div className="glass tone-cool p-4 sm:p-5 h-full flex flex-col">
      <CardTitle icon={<CloudSun size={15} />}>Nächste 3 Tage</CardTitle>
      <ForecastContent web={web} />
    </div>
  );
}

/** Content of the forecast card: one row per day. */
function ForecastContent({ web }: { web: WeatherData }) {
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

/* ------------------------------------------------------------------- rain */

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
function RainCard({ web, radar, lat, lon }: { web: WeatherData; radar: boolean; lat: number | null; lon: number | null }) {
  return (
    <div className="glass tone-cool p-4 sm:p-5 h-full">
      <CardTitle icon={<Umbrella size={15} />}>Regen</CardTitle>
      <RainContent web={web} />
      {radar && lat != null && lon != null && <div className="mt-4"><RadarMap lat={lat} lon={lon} tz={web.timezone} /></div>}
    </div>
  );
}

/** Rain summary sentence and the 15-minute precipitation bars. */
function RainContent({ web }: { web: WeatherData }) {
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

/* ------------------------------------------------------------------ block */

/** "Retry" (only after an error) and "set location" buttons; `compact` is the small variant of the hint bar. */
function SetupActions({ error, reload, compact = false }: { error: string | null; reload: () => void; compact?: boolean }) {
  const setView = useStore((s) => s.setView);
  const size = compact ? 13 : 14;
  const small = compact ? ' !py-1.5 !text-xs' : '';
  return (
    <>
      {error && <button className={`btn${small}`} onClick={reload}><RefreshCw size={size} /> Erneut versuchen</button>}
      <button className={`btn primary${small}`} onClick={() => setView('settings')}><MapPin size={size} /> Standort festlegen</button>
    </>
  );
}

/** The complete weather block; renders a setup hint while neither a location nor a local station is configured. */
export function WeatherSection() {
  const cfg = useStore((s) => s.config?.weather);
  const { data, error, loading, reload } = useWeatherData();
  const local = useLocalWeather();
  const nowSec = useNowSec();
  if (!cfg || !cfg.enabled) return null;

  const web = data?.configured ? data : null;
  const hasLocal = Object.keys(local).length > 0;

  if (loading && !data && !hasLocal) return <div className="glass tone-cool skeleton h-72 mb-6" />;

  if (!web && !hasLocal) {
    return (
      <div className="glass tone-cool p-6 mb-6 flex flex-wrap items-center gap-4">
        <WeatherIcon kind="partly" size={72} />
        <div className="flex-1 min-w-56">
          <h2 className="font-semibold">Wetter einrichten</h2>
          <p className="text-sm text-muted">{error ?? 'Wähle deinen Standort, dann erscheinen hier Wetter, Sonne, UV-Index, Prognose und Regenradar.'}</p>
        </div>
        <div className="flex gap-2">
          <SetupActions error={error} reload={reload} />
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 min-w-0"><Hero web={web} local={local} nowSec={nowSec} name={cfg.name} /></div>
        {web && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-1 min-w-0">
            <SunCard web={web} nowSec={nowSec} />
            <UvCard web={web} nowSec={nowSec} />
          </div>
        )}
      </div>
      {web && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="min-w-0"><ForecastCard web={web} /></div>
          <div className="xl:col-span-2 min-w-0"><RainCard web={web} radar={cfg.radar} lat={cfg.latitude} lon={cfg.longitude ?? null} /></div>
        </div>
      )}
      {/* only the local station is available: hint that the location is missing */}
      {!web && !loading && (
        <div className="glass tone-warm p-4 flex flex-wrap items-center gap-3 text-sm">
          <Thermometer size={16} className="text-muted" />
          <span className="text-muted flex-1">{error ?? 'Für Prognose, Sonne, UV-Index und Regenradar fehlt noch der Standort.'}</span>
          <SetupActions error={error} reload={reload} compact />
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- widgets */

const PART_TONE: Record<string, string> = { sun: '#fbbf24', uv: '#a78bfa', radar: '#38bdf8' };

/**
 * One part of the weather page as a widget of the own start page (`part`: see WEATHER_PARTS in
 * lib/widgets.ts). `label` is the title of the panel.
 */
export function WeatherPart({ part, label }: { part: string; label: string }) {
  const cfg = useStore((s) => s.config?.weather);
  const { data, error, loading } = useWeatherData();
  const local = useLocalWeather();
  const nowSec = useNowSec();
  const web = data?.configured ? data : null;
  const tone = PART_TONE[part] ?? '#22d3ee';
  const note = (text: string) => (
    <HudPanel title={label} color={tone} bodyClassName="flex items-center gap-2 text-sm text-muted">
      <CloudSun size={16} className="shrink-0" /> {text}
    </HudPanel>
  );
  if (!cfg?.enabled) return note('Wetter ist ausgeschaltet (Einstellungen → Wetter).');
  if (part === 'now') {
    const temp = pick(local.temperature, web?.current.temp);
    if (!web && !Object.keys(local).length) return note(loading ? 'Wetter wird geladen …' : error ?? 'Noch kein Standort und keine Wetterstation eingerichtet.');
    return (
      <HudPanel title={label} color={tone}>
        <HeroMetrics web={web} local={local} temp={temp} />
      </HudPanel>
    );
  }
  if (part === 'temperature') {
    return (
      <HudPanel title={label} color={tone}>
        <TemperatureChart web={web} nowSec={nowSec} />
      </HudPanel>
    );
  }
  if (!web) return note(loading ? 'Wetter wird geladen …' : error ?? 'Für diese Anzeige fehlt noch der Standort (Einstellungen → Wetter).');
  if (part === 'radar') {
    if (cfg.latitude == null || cfg.longitude == null) return note('Für das Regenradar fehlt noch der Standort.');
    return (
      <HudPanel title={label} color={tone} className="h-full min-h-0 flex flex-col" bodyClassName="flex-1 min-h-0 flex flex-col">
        <RadarMap lat={cfg.latitude} lon={cfg.longitude} tz={web.timezone} fill />
      </HudPanel>
    );
  }
  const content =
    part === 'hourly' ? <HourlyStrip web={web} nowSec={nowSec} />
    : part === 'sun' ? <SunContent web={web} nowSec={nowSec} />
    : part === 'uv' ? <UvContent web={web} nowSec={nowSec} />
    : part === 'forecast' ? <ForecastContent web={web} />
    : part === 'rain' ? <RainContent web={web} />
    : null;
  if (!content) return note('Unbekannte Anzeige – bitte über ⚙ neu wählen.');
  return (
    <HudPanel title={label} color={tone}>
      {content}
    </HudPanel>
  );
}
