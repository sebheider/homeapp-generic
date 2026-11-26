/**
 * The `kiosk` section of the configuration: settings sent to the agents (screen off, waking, quiet
 * hours, brightness, sensors).
 */
import { ALL_DAYS, toMinutes } from '../popup-rules.js';
import { clampNumber } from '../util/number.js';

/** Severities of notifications, lowest first (`wakeSeverity` = lowest one that wakes the screen). */
export const WAKE_SEVERITIES = ['info', 'warning', 'alarm'];
/** Default quiet hours: no notification switches the screen on at night. */
const DEFAULT_QUIET_HOURS = [{ days: ALL_DAYS, from: '22:00', to: '06:00' }];

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/**
 * Cleans a list of weekly time windows `{days, from, to}` (always-on times, quiet hours). Same
 * semantics as the pop-up rules: days 0 = Sunday … 6, windows may run over midnight (the part
 * after midnight belongs to the day it started), `from` equal to `to` means the whole day.
 * @param {unknown} list
 * @param {object[]} [fallback] used when `list` is not an array (setting never saved)
 */
export function sanitizeWindows(list, fallback = []) {
  const src = Array.isArray(list) ? list : fallback;
  return src
    .filter((w) => w && typeof w === 'object')
    .slice(0, 20)
    .map((w) => ({
      days: [...new Set((Array.isArray(w.days) ? w.days : ALL_DAYS).map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b),
      from: hhmm(toMinutes(w.from) ?? 0),
      to: hhmm(toMinutes(w.to) ?? 0),
    }));
}

/** Cleans the `kiosk` config section (settings sent to the agents). */
export function sanitizeKiosk(k = {}) {
  const s = k && typeof k === 'object' ? k : {};
  const luxDark = clampNumber(s.luxDark, 0, 10000, 5);
  const minBrightness = Math.round(clampNumber(s.minBrightness, 1, 100, 15));
  const maxBrightness = Math.round(clampNumber(s.maxBrightness, 1, 100, 100));
  return {
    screenOff: s.screenOff !== false, // switch the screen off without presence
    screenOffSeconds: Math.round(clampNumber(s.screenOffSeconds, 10, 7200, 180)),
    alwaysOn: sanitizeWindows(s.alwaysOn), // the screen stays on inside these windows, even without presence
    wakeOnCamera: s.wakeOnCamera !== false, // camera pop-ups switch the screen on
    wakeOnAlerts: s.wakeOnAlerts !== false, // new notifications (and finished prints) switch the screen on
    wakeSeverity: WAKE_SEVERITIES.includes(s.wakeSeverity) ? s.wakeSeverity : 'info',
    wakeSeconds: Math.round(clampNumber(s.wakeSeconds, 10, 3600, 120)), // how long a woken screen stays on without presence
    quietHours: sanitizeWindows(s.quietHours, DEFAULT_QUIET_HOURS), // no notification wakes the screen here (presence and touch still do)
    offTimes: sanitizeWindows(s.offTimes), // screen off here when there is no presence radar (or screenOff is false)
    dimTimes: sanitizeWindows(s.dimTimes), // dimBrightness here when there is no light sensor (or autoBrightness is false)
    // brightness inside / outside the dim times; until set they follow min / max (behaviour before 1.29)
    dimBrightness: Math.round(clampNumber(s.dimBrightness, 1, 100, minBrightness)),
    fullBrightness: Math.round(clampNumber(s.fullBrightness, 1, 100, maxBrightness)),
    autoBrightness: s.autoBrightness !== false,
    minBrightness,
    maxBrightness,
    luxDark,
    luxBright: Math.max(luxDark + 1, clampNumber(s.luxBright, 1, 100000, 400)),
    presenceMaxDistance: Math.round(clampNumber(s.presenceMaxDistance, 0, 800, 0)), // cm, 0 = whole range of the radar
    intervalSeconds: Math.round(clampNumber(s.intervalSeconds, 2, 300, 10)),
    co2Altitude: Math.round(clampNumber(s.co2Altitude, 0, 3000, 0)), // m above sea level (SCD41 pressure compensation)
    temperatureOffset: clampNumber(s.temperatureOffset, -10, 10, 0), // °C, the Pi warms the sensor
  };
}
