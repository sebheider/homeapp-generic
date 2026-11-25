/**
 * Weather helpers for the dashboard: WMO weather codes, UV scale and forecasts (lib/uv.ts), wind direction,
 * time formatting in the time zone of the location, and the data hook.
 */
import { useCallback, useEffect, useState } from 'react';
import { api, type WeatherData } from './api';
import { WEATHER_FIELDS, type WeatherFieldKey } from './weatherFields';
import { toNum } from './format';
import { useStateValues, useStore } from './store';

/** Visual condition used to pick the animated icon and the colours. */
export type Condition = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'thunder';

/** Presentation of a weather code. */
export interface CodeInfo {
  label: string;
  kind: Condition;
  /** Accent colour of the condition. */
  tone: string;
}

/** WMO weather interpretation codes as delivered by Open-Meteo. */
export function describeCode(code: number | null | undefined): CodeInfo {
  const c = code ?? -1;
  if (c === 0) return { label: 'Klar', kind: 'clear', tone: '#fbbf24' };
  if (c === 1) return { label: 'Überwiegend klar', kind: 'clear', tone: '#fbbf24' };
  if (c === 2) return { label: 'Teils bewölkt', kind: 'partly', tone: '#60a5fa' };
  if (c === 3) return { label: 'Bedeckt', kind: 'cloudy', tone: '#94a3b8' };
  if (c === 45 || c === 48) return { label: 'Nebel', kind: 'fog', tone: '#a1a1aa' };
  if (c >= 51 && c <= 55) return { label: 'Nieselregen', kind: 'drizzle', tone: '#38bdf8' };
  if (c === 56 || c === 57) return { label: 'Gefrierender Nieselregen', kind: 'drizzle', tone: '#67e8f9' };
  if (c === 61) return { label: 'Leichter Regen', kind: 'rain', tone: '#38bdf8' };
  if (c === 63) return { label: 'Regen', kind: 'rain', tone: '#38bdf8' };
  if (c === 65) return { label: 'Starker Regen', kind: 'rain', tone: '#3b82f6' };
  if (c === 66 || c === 67) return { label: 'Gefrierender Regen', kind: 'rain', tone: '#67e8f9' };
  if (c === 71) return { label: 'Leichter Schneefall', kind: 'snow', tone: '#bae6fd' };
  if (c === 73) return { label: 'Schneefall', kind: 'snow', tone: '#bae6fd' };
  if (c === 75 || c === 77) return { label: 'Starker Schneefall', kind: 'snow', tone: '#e0f2fe' };
  if (c === 80) return { label: 'Leichte Schauer', kind: 'rain', tone: '#38bdf8' };
  if (c === 81) return { label: 'Schauer', kind: 'rain', tone: '#38bdf8' };
  if (c === 82) return { label: 'Heftige Schauer', kind: 'rain', tone: '#3b82f6' };
  if (c === 85 || c === 86) return { label: 'Schneeschauer', kind: 'snow', tone: '#bae6fd' };
  if (c === 95) return { label: 'Gewitter', kind: 'thunder', tone: '#a78bfa' };
  if (c === 96 || c === 99) return { label: 'Gewitter mit Hagel', kind: 'thunder', tone: '#a78bfa' };
  return { label: '–', kind: 'cloudy', tone: '#94a3b8' };
}

export { uvChartHours, uvLevel, uvOutlook } from './uv';

const COMPASS = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
/** German 8-point compass direction for a bearing in degrees (handles negative / > 360 values). */
export const compass = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

/** Beaufort-like wording for a wind speed in km/h. */
export function windWord(kmh: number) {
  if (kmh < 2) return 'Windstill';
  if (kmh < 12) return 'Leichter Wind';
  if (kmh < 29) return 'Mäßiger Wind';
  if (kmh < 50) return 'Frischer Wind';
  if (kmh < 75) return 'Starker Wind';
  return 'Sturm';
}

const TIME_ONLY: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
/** Date formatters by time zone and options (charts format dozens of values per render). */
const dateFormats = new Map<string, Intl.DateTimeFormat>();
function dateFormat(tz: string, opts: Intl.DateTimeFormatOptions) {
  const key = `${tz}|${JSON.stringify(opts)}`;
  let f = dateFormats.get(key);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('de-DE', { timeZone: tz, ...opts });
    } catch {
      f = new Intl.DateTimeFormat('de-DE', opts);
    }
    dateFormats.set(key, f);
  }
  return f;
}

/** Formats a Unix time (seconds) in the time zone of the location; falls back to the browser zone for unknown zones. */
export function fmtTime(sec: number | null | undefined, tz: string, opts: Intl.DateTimeFormatOptions = TIME_ONLY) {
  return sec == null ? '–' : dateFormat(tz, opts).format(sec * 1000);
}

/** "5 h 12 min" for a number of seconds. */
export function fmtDuration(sec: number) {
  const m = Math.max(0, Math.round(sec / 60));
  const h = Math.floor(m / 60);
  return h ? `${h} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`;
}

/** Converted values of the local weather station; keys are missing when not mapped / not available. */
export type LocalWeather = Partial<Record<WeatherFieldKey, number>>;

const NO_IDS: Record<string, string> = {};

/** Values of the local weather station, already converted (wind in km/h); undefined when not mapped / not available. */
export function useLocalWeather(): LocalWeather {
  const cfg = useStore((s) => s.config?.weather);
  const moduleEnabled = useStore((s) => s.config?.modules?.weather !== false);
  // only the mapped datapoints are subscribed, other value changes do not re-render
  const vals = useStateValues(cfg?.states ?? NO_IDS);
  const local: LocalWeather = {};
  if (!cfg || !moduleEnabled) return local;
  for (const f of WEATHER_FIELDS) {
    const v = vals[f.key];
    if (v === undefined || v === null || v === '' || Number.isNaN(Number(v))) continue;
    let n = toNum(v);
    // the dashboard works in km/h; convert stations that report m/s
    if ((f.key === 'windSpeed' || f.key === 'windGust') && cfg.windUnit === 'ms') n *= 3.6;
    local[f.key] = n;
  }
  return local;
}

const WEATHER_REFRESH_MS = 10 * 60 * 1000;

/**
 * Forecast shared by every component and page: switching pages reuses the last answer while it is
 * younger than the refresh interval, and simultaneous requests are merged into one.
 */
const shared: { key: string; data: WeatherData | null; at: number; pending: Promise<WeatherData> | null } = { key: '', data: null, at: 0, pending: null };

function fetchWeather(key: string, force = false): Promise<WeatherData> {
  if (shared.key !== key) Object.assign(shared, { key, data: null, at: 0, pending: null });
  if (!force && shared.data && Date.now() - shared.at < WEATHER_REFRESH_MS) return Promise.resolve(shared.data);
  if (shared.pending) return shared.pending;
  // the age counts from the request start, so the 10-minute timer of a page always finds it due
  const started = Date.now();
  const p = api.weather().then(
    (d) => {
      if (shared.key === key) Object.assign(shared, { data: d, at: started });
      return d;
    },
  ).finally(() => {
    if (shared.pending === p) shared.pending = null;
  });
  shared.pending = p;
  return p;
}

/** Loads the internet forecast and refreshes it every 10 minutes and when the location changes. */
export function useWeatherData() {
  const lat = useStore((s) => s.config?.weather?.latitude);
  const lon = useStore((s) => s.config?.weather?.longitude);
  const enabled = useStore((s) => s.config?.weather?.enabled ?? true);
  const moduleEnabled = useStore((s) => s.config?.modules?.weather !== false);
  const demo = useStore((s) => s.status?.demo);
  const key = `${lat}|${lon}|${demo}`;
  const cached = shared.key === key ? shared.data : null;
  const [data, setData] = useState<WeatherData | null>(cached);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!cached);

  const load = useCallback((force = false) => {
    let alive = true;
    fetchWeather(key, force)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError(null);
      })
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [key]);

  useEffect(() => {
    if (!enabled) return;
    let cancel = load();
    const t = setInterval(() => {
      cancel();
      cancel = load();
    }, WEATHER_REFRESH_MS);
    return () => {
      cancel();
      clearInterval(t);
    };
  }, [enabled, load]);

  const reload = useCallback(() => {
    setLoading(true);
    load(true);
  }, [load]);

  return { data: moduleEnabled ? data : null, error: moduleEnabled ? error : null, loading: moduleEnabled && loading, reload };
}
