/**
 * Helpers for plain objects (configuration sections, JSON from outside).
 */

/** Truthy for plain objects: not null, not an array. */
export const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Deep merge for plain objects; arrays and primitives of `extra` replace those of `base`. */
export function merge(base, extra) {
  const out = { ...base };
  for (const [k, v] of Object.entries(extra || {})) {
    out[k] = isObj(v) && isObj(base[k]) ? merge(base[k], v) : v;
  }
  return out;
}

/** Reads a nested field by dotted path, e.g. getPath(cfg, 'iobroker.host'). */
export const getPath = (obj, p) => p.split('.').reduce((o, k) => o?.[k], obj);

/** Writes a nested field by dotted path, creating missing intermediate objects. */
export const setPath = (obj, p, v) => {
  const keys = p.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => (o[k] ??= {}), obj)[last] = v;
};
