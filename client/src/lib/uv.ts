/**
 * UV index: the WHO scale and the short forecasts of the weather page and the overview header. Pure
 * functions without runtime imports, so they can be tested directly (re-exported by lib/weather.ts).
 */
import type { WeatherData } from './api';

/** UV index scale (WHO): label, colour and short advice. */
export function uvLevel(uv: number | null | undefined) {
  const v = uv ?? 0;
  if (v < 3) return { label: 'Niedrig', color: '#34d399', advice: 'Kein Sonnenschutz nötig.' };
  if (v < 6) return { label: 'Mäßig', color: '#facc15', advice: 'Sonnenschutz empfohlen, Mittagssonne meiden.' };
  if (v < 8) return { label: 'Hoch', color: '#fb923c', advice: 'Sonnenschutz nötig: Creme, Hut, Sonnenbrille.' };
  if (v < 11) return { label: 'Sehr hoch', color: '#f43f5e', advice: 'Starker Schutz nötig, Aufenthalt in der Sonne begrenzen.' };
  return { label: 'Extrem', color: '#a855f7', advice: 'Aufenthalt im Freien möglichst vermeiden.' };
}

type HourlyEntry = WeatherData['hourly'][number];

/**
 * Hours of a UV forecast: the next `count` hours; once the sun is down (all values below 0.5), the
 * daylight hours of tomorrow instead of a row of zeros (`tomorrow` tells which one it is).
 */
export function uvChartHours(hourly: HourlyEntry[], tomorrowDay: WeatherData['daily'][number] | undefined, nowSec: number, count = 14) {
  const next = hourly.filter((h) => h.t > nowSec - 3600).slice(0, count);
  if (Math.max(0, ...next.map((h) => h.uv ?? 0)) < 0.5 && tomorrowDay) {
    const start = (tomorrowDay.sunrise ?? tomorrowDay.t + 6 * 3600) - 3600;
    const end = (tomorrowDay.sunset ?? tomorrowDay.t + 20 * 3600) + 3600;
    const day = hourly.filter((h) => h.t >= start && h.t <= end);
    if (day.length) return { shown: day.slice(0, count), tomorrow: true };
  }
  return { shown: next, tomorrow: false };
}

/**
 * Short UV forecast for compact displays: current value, the coming hours with sun (or those of tomorrow
 * after sunset; hours with a UV below 0.5 at both ends are left out) and their peak. Null without a UV forecast.
 */
export function uvOutlook(web: WeatherData | null | undefined, nowSec: number, count = 12) {
  if (!web || web.current.uv == null) return null;
  const hourly = web.hourly.filter((h) => h.uv != null);
  const { shown: hours, tomorrow } = uvChartHours(hourly, web.daily[1], nowSec, count);
  const sunny = (h: HourlyEntry) => (h.uv ?? 0) >= 0.5;
  const first = hours.findIndex(sunny);
  const shown = first < 0 ? [] : hours.slice(first, hours.length - [...hours].reverse().findIndex(sunny));
  const peak = shown.reduce<HourlyEntry | null>((m, h) => (!m || (h.uv ?? 0) > (m.uv ?? 0) ? h : m), null);
  return { now: web.current.uv, shown, tomorrow, peak };
}
