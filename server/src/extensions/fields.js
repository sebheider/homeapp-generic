/**
 * Checks of single manifest fields. Every problem is thrown as an {@link ExtensionError} whose message
 * names the offending field and is shown to the admin as is.
 */

/** Error with a message that is shown to the admin as is. */
export class ExtensionError extends Error {}
/** Throws an {@link ExtensionError} with the message `msg`. */
export const fail = (msg) => {
  throw new ExtensionError(msg);
};

/** Optional or required text field of the manifest, trimmed. */
export function text(v, field, { max, required = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) fail(`"${field}" fehlt`);
    return '';
  }
  if (typeof v !== 'string') fail(`"${field}" muss ein Text sein`);
  const s = v.trim();
  if (required && !s) fail(`"${field}" darf nicht leer sein`);
  if (s.length > max) fail(`"${field}" darf höchstens ${max} Zeichen lang sein`);
  return s;
}

/** Optional number field (undefined if missing). */
export function number(v, field) {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`"${field}" muss eine Zahl sein`);
  return v;
}

/** Optional true/false field (false if missing). */
export function bool(v, field) {
  if (v === undefined || v === null) return false;
  if (typeof v !== 'boolean') fail(`"${field}" muss true oder false sein`);
  return v;
}

/** Optional list field with at most `max` entries ([] if missing). */
export function list(v, field, max) {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) fail(`"${field}" muss eine Liste sein`);
  if (v.length > max) fail(`"${field}" darf höchstens ${max} Einträge haben`);
  return v;
}
