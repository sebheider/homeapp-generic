/**
 * Internet weather for the dashboard.
 *
 * - Forecast: Open-Meteo (https://open-meteo.com, free, no API key): current conditions, hourly values,
 *   daily values incl. sunrise / sunset / UV index, and a 15-minute precipitation nowcast.
 * - Place search: Open-Meteo geocoding (place name or postcode -> coordinates).
 * - Rain radar: only the frame index of RainViewer is fetched here; the browser loads the tiles itself.
 *
 * Results are cached (the dashboard polls often, the forecast only changes every few minutes). If the
 * internet is unreachable the last result is served with `stale: true`.
 * Times are Unix seconds; `timezone` is the IANA name of the location so the browser can format them correctly.
 */
import { finiteOrNull, round } from './util/number.js';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const RADAR_URL = 'https://api.rainviewer.com/public/weather-maps.json';

const FORECAST_TTL = 10 * 60 * 1000;
const RADAR_TTL = 2 * 60 * 1000;

const CURRENT = 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day,uv_index';
const HOURLY = 'temperature_2m,precipitation_probability,precipitation,weather_code,uv_index,is_day';
const DAILY = 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,daylight_duration,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max';

/** Rounded number or null (missing values stay missing). */
const rnd = (v, d = 1) => (finiteOrNull(v) === null ? null : round(v, d));

/** Converts the column-oriented Open-Meteo response into row objects used by the app. */
export function normalizeForecast(raw, now = Date.now()) {
  const c = raw.current ?? {};
  const rows = (block, map) => (block?.time ?? []).map((t, i) => map(t, i, block));
  return {
    fetchedAt: now,
    timezone: raw.timezone,
    elevation: finiteOrNull(raw.elevation),
    current: {
      time: c.time,
      temp: rnd(c.temperature_2m),
      feelsLike: rnd(c.apparent_temperature),
      humidity: finiteOrNull(c.relative_humidity_2m),
      pressure: rnd(c.pressure_msl),
      wind: rnd(c.wind_speed_10m),
      gust: rnd(c.wind_gusts_10m),
      windDir: finiteOrNull(c.wind_direction_10m),
      precip: rnd(c.precipitation),
      cloud: finiteOrNull(c.cloud_cover),
      code: finiteOrNull(c.weather_code),
      isDay: c.is_day === 1,
      uv: rnd(c.uv_index),
    },
    hourly: rows(raw.hourly, (t, i, h) => ({
      t,
      temp: rnd(h.temperature_2m?.[i]),
      pop: finiteOrNull(h.precipitation_probability?.[i]),
      precip: rnd(h.precipitation?.[i]),
      code: finiteOrNull(h.weather_code?.[i]),
      uv: rnd(h.uv_index?.[i]),
      isDay: h.is_day?.[i] === 1,
    })),
    daily: rows(raw.daily, (t, i, d) => ({
      t,
      code: finiteOrNull(d.weather_code?.[i]),
      tMax: rnd(d.temperature_2m_max?.[i]),
      tMin: rnd(d.temperature_2m_min?.[i]),
      sunrise: finiteOrNull(d.sunrise?.[i]),
      sunset: finiteOrNull(d.sunset?.[i]),
      daylight: finiteOrNull(d.daylight_duration?.[i]),
      uvMax: rnd(d.uv_index_max?.[i]),
      precip: rnd(d.precipitation_sum?.[i]),
      pop: finiteOrNull(d.precipitation_probability_max?.[i]),
      wind: rnd(d.wind_speed_10m_max?.[i]),
    })),
    // precipitation per 15 minutes (mm); empty outside of regions with a nowcast model
    nowcast: rows(raw.minutely_15, (t, i, m) => ({ t, precip: rnd(m.precipitation?.[i], 2) })).filter((x) => x.precip !== null),
  };
}

/** Synthetic forecast for the demo mode (no internet needed). */
export function demoForecast(now = Date.now()) {
  const day = 86400;
  const t0 = Math.floor(now / 1000 / 3600) * 3600;
  const midnight = Math.floor(now / 1000 / day) * day - 3600; // roughly local midnight (CET)
  const hourly = Array.from({ length: 96 }, (_, i) => {
    const t = t0 - 6 * 3600 + i * 3600;
    const h = ((t % day) / 3600 + 1) % 24;
    const sun = Math.max(0, Math.sin(((h - 7) / 11) * Math.PI));
    return {
      t,
      temp: rnd(7 + 6 * Math.sin(((h - 9) / 24) * 2 * Math.PI) + Math.sin(i / 9)),
      pop: Math.round(Math.max(0, 40 * Math.sin(i / 7) + 20)),
      precip: i % 23 > 19 ? 0.6 : 0,
      code: i % 23 > 19 ? 61 : sun > 0.4 ? 1 : 3,
      uv: rnd(4.2 * sun ** 1.5),
      isDay: sun > 0,
    };
  });
  const daily = Array.from({ length: 4 }, (_, i) => ({
    t: midnight + i * day,
    code: [2, 3, 61, 1][i],
    tMax: [12, 11, 9, 13][i],
    tMin: [5, 4, 4, 3][i],
    sunrise: midnight + i * day + 7 * 3600 + 25 * 60,
    sunset: midnight + i * day + 17 * 3600 + 5 * 60,
    daylight: 9.7 * 3600,
    uvMax: [3.6, 2.8, 1.4, 3.9][i],
    precip: [0, 0.4, 5.2, 0][i],
    pop: [10, 30, 85, 5][i],
    wind: [18, 22, 31, 14][i],
  }));
  const q0 = Math.floor(now / 1000 / 900) * 900;
  return {
    fetchedAt: now,
    demo: true,
    timezone: 'Europe/Berlin',
    elevation: 0,
    current: { time: q0, temp: 9.8, feelsLike: 7.9, humidity: 71, pressure: 1016, wind: 14, gust: 26, windDir: 230, precip: 0, cloud: 55, code: 2, isDay: hourly.find((h) => h.t === t0)?.isDay ?? true, uv: hourly.find((h) => h.t === t0)?.uv ?? 0 },
    hourly,
    daily,
    nowcast: Array.from({ length: 12 }, (_, i) => ({ t: q0 + i * 900, precip: i >= 5 && i <= 8 ? rnd(0.15 * (i - 4), 2) : 0 })),
  };
}

/** Sanitises coordinates from the config; returns null when they are not usable. */
export function validCoords(lat, lon) {
  const a = Number(lat);
  const o = Number(lon);
  if (lat === null || lon === null || lat === '' || lon === '') return null;
  if (!Number.isFinite(a) || !Number.isFinite(o) || Math.abs(a) > 90 || Math.abs(o) > 180) return null;
  return { lat: a, lon: o };
}

/** Local weather station datapoints that can be mapped (key -> label is in the client). */
export const WEATHER_STATE_KEYS = ['temperature', 'feelsLike', 'dewPoint', 'humidity', 'pressure', 'windSpeed', 'windGust', 'windDir', 'rainToday', 'rainLastHour', 'lux'];

/** Cleans the weather block of the configuration (coordinates, units, only known datapoint keys). */
export function sanitizeWeather(w = {}) {
  const c = validCoords(w.latitude, w.longitude);
  const states = {};
  for (const k of WEATHER_STATE_KEYS) if (typeof w.states?.[k] === 'string' && w.states[k].trim()) states[k] = w.states[k].trim();
  return {
    enabled: w.enabled !== false,
    name: String(w.name ?? '').slice(0, 80),
    latitude: c ? c.lat : null,
    longitude: c ? c.lon : null,
    radar: w.radar !== false,
    windUnit: w.windUnit === 'ms' ? 'ms' : 'kmh',
    states,
  };
}

/** Client for the internet weather services with caching (see module comment). */
export class WeatherService {
  /** @param {typeof fetch} fetchImpl injectable for tests */
  constructor(fetchImpl = (...a) => fetch(...a)) {
    this.fetch = fetchImpl;
    this.cache = new Map();
    this.pending = new Map();
  }

  /** Cached request with in-flight de-duplication and stale fallback. */
  async cached(key, ttl, load) {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.value;
    if (this.pending.has(key)) return this.pending.get(key);
    const p = load()
      .then((value) => {
        this.cache.set(key, { at: Date.now(), value });
        return value;
      })
      .catch((err) => {
        if (hit) return { ...hit.value, stale: true, error: err.message };
        throw err;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, p);
    return p;
  }

  /** GET request with a 10 s timeout that expects JSON. */
  async json(url) {
    const res = await this.fetch(url, { signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json', 'User-Agent': 'HomeApp' } });
    if (!res.ok) throw new Error(`Wetterdienst antwortet mit Fehler ${res.status}`);
    return res.json();
  }

  /** Forecast for a location (cached per ~1 km grid cell for FORECAST_TTL). */
  forecast(lat, lon) {
    const key = `f:${lat.toFixed(2)},${lon.toFixed(2)}`;
    return this.cached(key, FORECAST_TTL, async () => {
      const q = new URLSearchParams({
        latitude: lat.toFixed(4),
        longitude: lon.toFixed(4),
        current: CURRENT,
        hourly: HOURLY,
        daily: DAILY,
        minutely_15: 'precipitation',
        forecast_minutely_15: '16',
        past_minutely_15: '2',
        timezone: 'auto',
        timeformat: 'unixtime',
        forecast_days: '4',
        past_hours: '6',
      });
      return normalizeForecast(await this.json(`${FORECAST_URL}?${q}`));
    });
  }

  /** Place search by name or postcode. */
  async geocode(query) {
    const q = String(query ?? '').trim();
    if (q.length < 2) return [];
    const data = await this.json(`${GEOCODE_URL}?${new URLSearchParams({ name: q, count: '6', language: 'de', format: 'json' })}`);
    return (data.results ?? []).map((r) => ({
      name: r.name,
      region: [r.admin1, r.country].filter(Boolean).join(', '),
      latitude: rnd(r.latitude, 4),
      longitude: rnd(r.longitude, 4),
      elevation: finiteOrNull(r.elevation),
    }));
  }

  /** Radar frame index: past frames (and nowcast frames if the provider has them), oldest first. */
  radar() {
    return this.cached('radar', RADAR_TTL, async () => {
      const d = await this.json(RADAR_URL);
      const frames = [...(d.radar?.past ?? []), ...(d.radar?.nowcast ?? [])].map((f) => ({ time: f.time, path: f.path }));
      return { host: d.host, frames, fetchedAt: Date.now() };
    });
  }
}
