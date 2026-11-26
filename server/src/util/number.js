/**
 * Number helpers shared by several server modules.
 */

/** Limits `v` to the range [min, max]. */
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/** Rounds to `digits` decimal places. */
export const round = (v, digits = 1) => Math.round(v * 10 ** digits) / 10 ** digits;

/** Rounds to one decimal place; null stays null. */
export const round1 = (v) => (v === null ? null : Math.round(v * 10) / 10);

/**
 * A number (or numeric text) limited to [min, max], e.g. a value of the configuration; `fallback` for
 * missing (null, undefined, '') or non-numeric values.
 */
export const clampNumber = (v, min, max, fallback) => {
  const n = Number(v);
  return v === null || v === undefined || v === '' || !Number.isFinite(n) ? fallback : Math.min(max, Math.max(min, n));
};

/** `v` if it is a finite number, otherwise null (numeric text does not count). */
export const finiteOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
