/**
 * Helpers for datapoint values and objects, shared by the state sources (ioBroker, Home Assistant, demo,
 * kiosk agents) and the modules that evaluate their values.
 */

/** Interprets the usual ioBroker representations of "on" (true, 1, 'true'). */
export const isOn = (v) => v === true || v === 1 || v === 'true';

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
