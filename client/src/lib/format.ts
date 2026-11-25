/** Number, power, time and text formatting helpers (German locale). */

/** Placeholder shown for missing values. */
export const NO_VALUE = '–';

/** Number formatters by decimal count (creating an `Intl` formatter is expensive, values are formatted on every render). */
const numberFormats = new Map<number, Intl.NumberFormat>();
const nf = (d: number) => {
  let f = numberFormats.get(d);
  if (!f) numberFormats.set(d, (f = new Intl.NumberFormat('de-DE', { maximumFractionDigits: d, minimumFractionDigits: 0 })));
  return f;
};

/** Formats a number with up to `digits` decimals ("1.234,5"). */
export const num = (v: number, digits = 1) => nf(digits).format(v);

/** Like `num`, but renders "–" for null / undefined. */
export const numOrDash = (v: number | null | undefined, digits = 1) => (v == null ? NO_VALUE : num(v, digits));

/** Splits a power value into number and unit; switches to kW from 1000 W (or always with `forceKw`). */
export function power(w: number | undefined | null, forceKw = false): { value: string; unit: string } {
  if (w == null || Number.isNaN(w)) return { value: NO_VALUE, unit: 'W' };
  const abs = Math.abs(w);
  if (forceKw || abs >= 1000) return { value: nf(abs >= 10000 ? 1 : 2).format(w / 1000), unit: 'kW' };
  return { value: nf(0).format(w), unit: 'W' };
}

/** Power as a single string, e.g. "1,25 kW". */
export const powerText = (w: number | undefined | null) => {
  const p = power(w);
  return `${p.value} ${p.unit}`;
};

/** Converts datapoint values (numbers, numeric strings, ...) to a finite number. */
export const toNum = (v: unknown, fallback = 0) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Limits `v` to the range a..b. */
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Local wall-clock time "HH:MM" of a timestamp or date. */
const clockFormat = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
export const clockTime = (t: number | Date) => clockFormat.format(t);

/** Greeting that matches the time of day. */
export function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return 'Gute Nacht';
  if (h < 11) return 'Guten Morgen';
  if (h < 17) return 'Guten Tag';
  if (h < 22) return 'Guten Abend';
  return 'Gute Nacht';
}

/** Relative time in seconds / minutes / hours, e.g. "vor 5 min". */
export const timeAgo = (ts: number) => {
  // never "vor -2 s" when the clocks of server and browser differ slightly
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `vor ${s} s`;
  if (s < 3600) return `vor ${Math.round(s / 60)} min`;
  return `vor ${Math.round(s / 3600)} h`;
};

/** Parses "value:Label,value2:Label2" style lists used in the settings editor. */
export const parseList = (text: string) =>
  text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const i = s.indexOf(':');
      return i < 0 ? { value: s, label: s } : { value: s.slice(0, i).trim(), label: s.slice(i + 1).trim() };
    });

/** Inverse of `parseList`. */
export const stringifyList = (list?: { value: string; label: string }[]) =>
  (list || []).map((o) => `${o.value}:${o.label}`).join(', ');
