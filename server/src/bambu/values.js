/**
 * Lenient readers for the values of a Bambu Lab report (the printers send numbers as numbers or as text).
 */

/** A number from a report value (number or numeric text); null for anything else. */
export const num = (v) => {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Low word = current, high word = target value (newer firmware packs both into one number). */
export const unpack = (v) => {
  const n = num(v);
  return n === null ? null : { actual: n & 0xffff, target: (n >> 16) & 0xffff };
};
