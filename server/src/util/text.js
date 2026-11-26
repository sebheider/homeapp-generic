/**
 * Text helpers shared by several server modules.
 */

/** `v` as text without surrounding whitespace and with at most `max` characters (null and undefined give ''). */
export const trimText = (v, max) => String(v ?? '').trim().slice(0, max);

/** Escapes all characters with a special meaning in regular expressions. */
export const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
