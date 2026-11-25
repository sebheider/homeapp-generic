/**
 * Small helpers shared by several server modules.
 */

/** Limits `v` to the range [min, max]. */
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/** Rounds to `digits` decimal places. */
export const round = (v, digits = 1) => Math.round(v * 10 ** digits) / 10 ** digits;

/** Interprets the usual ioBroker representations of "on" (true, 1, 'true'). */
export const isOn = (v) => v === true || v === 1 || v === 'true';

/** Escapes all characters with a special meaning in regular expressions. */
export const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Full-text search over ioBroker objects: every whitespace separated term must occur
 * in the id or the name (case-insensitive). Stops after `limit` hits.
 * @param {Iterable<{id: string, name: string}>} objects
 * @param {string} query
 * @param {number} [limit]
 */
export function searchObjects(objects, query, limit = 30) {
  const terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  const out = [];
  for (const o of objects) {
    if (terms.every((t) => `${o.id} ${o.name}`.toLowerCase().includes(t))) {
      out.push(o);
      if (out.length >= limit) break;
    }
  }
  return out;
}
