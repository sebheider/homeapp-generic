/**
 * Pop-up schedule rules.
 *
 * A rule decides WHEN which kind of detection may pop up:
 *   {
 *     id, name, enabled,
 *     kinds:   ['motion', 'people']      kinds of detection the rule applies to
 *     days:    [0..6]                    weekdays (JavaScript numbering: 0 = Sunday ... 6 = Saturday)
 *     from:    'HH:MM', to: 'HH:MM'      time window, `from` inclusive, `to` exclusive
 *     cameras: ['21', ...]               empty = all cameras
 *   }
 *
 * Time windows may run over midnight (from 22:00 to 06:00). The part after midnight counts
 * for the weekday on which the window started. `from` equal to `to` means "the whole day".
 *
 * Semantics: if at least one rule is enabled, a pop-up is shown only when one of the enabled
 * rules matches. Without any enabled rule the global switches decide (always on or off).
 * Times are server local time (set the container time zone with TZ, e.g. Europe/Berlin).
 */

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
/** Kinds of detection: normal motion and advanced detection (people). */
export const KINDS = ['motion', 'people'];

/** "HH:MM" -> minutes since midnight (24:00 allowed), or null if invalid. */
export function toMinutes(text) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(text ?? ''));
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return minutes <= 1440 ? minutes : null;
}

/** True if `now` lies inside the rule's weekday and time window. */
export function inWindow(rule, now = new Date()) {
  const days = Array.isArray(rule.days) && rule.days.length ? rule.days.map(Number) : ALL_DAYS;
  const from = toMinutes(rule.from) ?? 0;
  const to = toMinutes(rule.to) ?? 0;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const today = now.getDay();
  const yesterday = (today + 6) % 7;
  if (from === to) return days.includes(today); // whole day
  if (from < to) return minutes >= from && minutes < to && days.includes(today);
  // overnight window: the evening part belongs to today, the morning part to the day before
  return (minutes >= from && days.includes(today)) || (minutes < to && days.includes(yesterday));
}

/** True if the rule applies to this kind of detection and camera right now. */
export function ruleMatches(rule, kind, cameraId, now = new Date()) {
  const kinds = Array.isArray(rule.kinds) && rule.kinds.length ? rule.kinds : KINDS;
  if (!kinds.includes(kind)) return false;
  const cams = Array.isArray(rule.cameras) ? rule.cameras.map(String) : [];
  if (cams.length && !cams.includes(String(cameraId))) return false;
  return inWindow(rule, now);
}

/** Decides whether a detection of `kind` on `cameraId` may pop up at `now`. */
export function popupAllowed(app, kind, cameraId, now = new Date()) {
  const rules = (app?.popupRules || []).filter((r) => r && r.enabled !== false);
  if (!rules.length) return true;
  return rules.some((r) => ruleMatches(r, kind, cameraId, now));
}

/**
 * Global decision for a detection: the app-wide switch of the kind (`motionPopup` / `peoplePopup`)
 * AND the schedule rules. Per-camera switches are not part of this (see MotionHub).
 */
export function kindPopupAllowed(app, kind, cameraId, now = new Date()) {
  const kindOn = kind === 'people' ? app?.peoplePopup !== false : app?.motionPopup !== false;
  return kindOn && popupAllowed(app, kind, cameraId, now);
}

/** Cleans rules coming from the browser (types, ranges, unknown fields). */
export function sanitizeRules(rules) {
  if (!Array.isArray(rules)) return [];
  return rules.slice(0, 50).map((r, i) => ({
    id: String(r?.id || `regel_${i + 1}`).slice(0, 40),
    name: String(r?.name || `Regel ${i + 1}`).slice(0, 60),
    enabled: r?.enabled !== false,
    kinds: (Array.isArray(r?.kinds) ? r.kinds : KINDS).filter((k) => KINDS.includes(k)),
    days: (Array.isArray(r?.days) ? r.days : ALL_DAYS).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
    from: toMinutes(r?.from) === null ? '00:00' : String(r.from),
    to: toMinutes(r?.to) === null ? '00:00' : String(r.to),
    cameras: (Array.isArray(r?.cameras) ? r.cameras : []).map(String).slice(0, 100),
  }));
}
