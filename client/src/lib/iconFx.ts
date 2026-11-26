/**
 * Icon effects of the device cards: which animation an icon gets while its device runs and how strongly
 * the glow ("halo") behind the icon shines. The animations themselves are CSS classes in styles/animations.css
 * (`anim-*`) and styles/surfaces.css (`.icon-bubble.halo`) and follow the effects level of the device (`html[data-effects]`).
 */

/** Animation classes of running devices by icon name; icons without an entry only glow. */
const RUNNING: Record<string, string> = {
  fan: 'anim-spin',
  airvent: 'anim-sway',
  wind: 'anim-sway',
  washing: 'anim-wobble',
  flame: 'anim-flicker',
  snowflake: 'anim-spin-slow',
  droplets: 'anim-bob',
  shower: 'anim-bob',
  coffee: 'anim-bob',
  cooking: 'anim-bob',
  zap: 'anim-zap',
  plug: 'anim-zap',
  power: 'anim-zap',
};

/** Animation class for the icon of a running device (`''` = no motion, the halo is enough). */
export function runningIconClass(name?: string | null): string {
  return (name && RUNNING[name]) || '';
}

/** Glow strength 0.15…1 of an icon halo from a level in percent (`null` = full, e.g. lights without dimmer). */
export function glowLevel(percent: number | null | undefined): number {
  if (percent == null || !Number.isFinite(percent)) return 1;
  return Math.round(Math.min(1, Math.max(0.15, percent / 100)) * 100) / 100;
}

/** Wind speed in km/h from which the weather symbol shows gusts. */
export const WINDY_KMH = 30;

/** Extra details of the weather symbol derived from the WMO code and the wind speed. */
export function weatherExtras(code?: number | null, windKmh?: number | null) {
  const c = code ?? -1;
  return {
    /** showers: the sun (or moon) peeks out behind the cloud */
    showers: (c >= 80 && c <= 82) || c === 85 || c === 86,
    /** heavy rain or snow: more drops / flakes */
    heavy: c === 65 || c === 67 || c === 75 || c === 82 || c === 86,
    /** freezing drizzle / rain: icy drops */
    freezing: c === 56 || c === 57 || c === 66 || c === 67,
    /** thunderstorm with hail */
    hail: c === 96 || c === 99,
    windy: windKmh != null && windKmh >= WINDY_KMH,
  };
}
