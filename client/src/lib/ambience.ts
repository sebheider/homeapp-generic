/**
 * Ambience of the app: the time of day tints the background (dawn, day, dusk, night – by the sun times of
 * the weather data, otherwise by the clock) and rain or snow falls through the hero panel. Both follow
 * the effects level (`html[data-effects]`): the tint is a still layer, the precipitation only runs on 'high'.
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
