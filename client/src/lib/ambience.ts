/**
 * Ambience of the app: the time of day tints the background (dawn, day, dusk, night – by the sun times of
 * the weather data, otherwise by the clock), rain or snow falls through the hero panel and the outside
 * temperature gets its colour (frost, mild, heat). All follow the effects level (`html[data-effects]`):
 * the tint is a still layer, the precipitation only runs on 'high'.
 */
import type { Condition } from './weather';

export type Daypart = 'dawn' | 'day' | 'dusk' | 'night';

const MIN = 60;

/**
 * Part of the day at `now`: with today's sunrise / sunset (epoch seconds) dawn lasts from 45 min before
 * to 75 min after sunrise and dusk from 75 min before to 45 min after sunset; without sun times fixed hours.
 */
export function daypart(now: Date, sunrise?: number | null, sunset?: number | null): Daypart {
  if (sunrise != null && sunset != null && sunset > sunrise) {
    const t = now.getTime() / 1000;
    if (t >= sunrise - 45 * MIN && t < sunrise + 75 * MIN) return 'dawn';
    if (t >= sunrise + 75 * MIN && t < sunset - 75 * MIN) return 'day';
    if (t >= sunset - 75 * MIN && t < sunset + 45 * MIN) return 'dusk';
    return 'night';
  }
  const h = now.getHours() + now.getMinutes() / 60;
  if (h >= 6 && h < 8) return 'dawn';
  if (h >= 8 && h < 18) return 'day';
  if (h >= 18 && h < 20) return 'dusk';
  return 'night';
}

/** Precipitation shown in the hero panel for a weather condition (`null` = dry). */
export function precipitation(kind: Condition | null | undefined): 'rain' | 'snow' | null {
  if (kind === 'rain' || kind === 'drizzle' || kind === 'thunder') return 'rain';
  if (kind === 'snow') return 'snow';
  return null;
}

/**
 * Deterministic particles for the precipitation layer: horizontal position (%), delay and duration (s)
 * spread evenly with a little jitter, so every render yields the same picture.
 */
export function particles(count: number, kind: 'rain' | 'snow') {
  const base = kind === 'rain' ? 0.9 : 6;
  return Array.from({ length: count }, (_, i) => {
    const jitter = ((i * 37) % 11) / 10;
    return {
      left: Math.round(((i + 0.5) / count) * 1000 + (jitter - 0.5) * 40) / 10,
      delay: -Math.round(((i * 53) % 17) / 17 * base * 100) / 100,
      duration: Math.round(base * (0.8 + jitter * 0.4) * 100) / 100,
    };
  });
}

/** Look of the outside temperature: frost below 0 °C, heat from 30 °C, in between a colour along the scale. */
export type TemperatureLook = { kind: 'frost' | 'mild' | 'heat'; color: string };

/** Colour stops of the mild range (°C → colour): ice blue, cyan, green, yellow, orange. */
const TEMPERATURE_STOPS: readonly [number, [number, number, number]][] = [
  [0, [96, 165, 250]],
  [8, [34, 211, 238]],
  [16, [52, 211, 153]],
  [23, [250, 204, 21]],
  [30, [249, 115, 22]],
];
export const FROST_COLOR = '#60a5fa';
export const HEAT_COLOR = '#ef4444';

const hex = (rgb: number[]) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;

/** Look of a temperature (°C): `frost` below 0, `heat` from 30, otherwise `mild` with a colour interpolated along the stops. */
export function temperatureLook(t: number): TemperatureLook {
  if (!Number.isFinite(t)) return { kind: 'mild', color: hex(TEMPERATURE_STOPS[1][1]) };
  if (t < 0) return { kind: 'frost', color: FROST_COLOR };
  if (t >= 30) return { kind: 'heat', color: HEAT_COLOR };
  const i = TEMPERATURE_STOPS.findIndex(([at]) => at > t);
  const [t0, c0] = TEMPERATURE_STOPS[i - 1];
  const [t1, c1] = TEMPERATURE_STOPS[i];
  const f = (t - t0) / (t1 - t0);
  return { kind: 'mild', color: hex(c0.map((c, k) => c + (c1[k] - c) * f)) };
}

/** Mood of the sun in the weather icon (°C): freezing from −5 °C downwards, sweating from 30 °C, otherwise mild. */
export type SunMood = 'frost' | 'mild' | 'heat';

export function sunMood(t: number | null | undefined): SunMood {
  if (t == null || !Number.isFinite(t)) return 'mild';
  if (t <= -5) return 'frost';
  return t >= 30 ? 'heat' : 'mild';
}