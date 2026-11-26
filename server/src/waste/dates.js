/**
 * Calendar days as 'YYYY-MM-DD' in server local time.
 */

const pad = (n) => String(n).padStart(2, '0');
/** Local calendar day of a Date as 'YYYY-MM-DD'. */
export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** 'YYYY-MM-DD' -> local midnight. */
export const dayStart = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
/** The day `n` days after `key` (before it for negative `n`). */
export const addDays = (key, n) => {
  const d = dayStart(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
};
