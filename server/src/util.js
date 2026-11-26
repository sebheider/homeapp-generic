/**
 * Small helpers shared by several server modules. They live in util/ (number.js, text.js, object.js,
 * states.js, fs.js, timers.js); this file re-exports the ones it always offered.
 */
export { clamp, round } from './util/number.js';
export { escapeRegExp } from './util/text.js';
export { isOn, searchObjects } from './util/states.js';
