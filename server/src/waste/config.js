/**
 * The `waste` section of the configuration.
 */

export const WASTE_SEVERITIES = ['warning', 'info'];

/** "HH:MM" -> minutes since midnight, or null. */
export const toMinutes = (t) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t ?? ''));
  return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null;
};

/** Cleans the `waste` config section. */
export function sanitizeWaste(w = {}) {
  const v = w && typeof w === 'object' ? w : {};
  let url = String(v.url ?? '').trim().slice(0, 1000);
  if (/^webcals?:\/\//i.test(url)) url = url.replace(/^webcals?:/i, 'https:');
  return {
    enabled: v.enabled === true,
    url: /^https?:\/\//i.test(url) ? url : '',
    remindFrom: toMinutes(v.remindFrom) === null ? '17:00' : String(v.remindFrom),
    remindUntil: toMinutes(v.remindUntil) === null ? '10:00' : String(v.remindUntil),
    severity: WASTE_SEVERITIES.includes(v.severity) ? v.severity : 'warning',
    hidden: (Array.isArray(v.hidden) ? v.hidden : []).map((k) => String(k).slice(0, 44)).slice(0, 30),
  };
}
