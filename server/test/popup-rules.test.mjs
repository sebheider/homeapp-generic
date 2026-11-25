import assert from 'node:assert/strict';
import { popupAllowed, sanitizeRules } from '../src/popup-rules.js';

// 2026-10-16 is a Friday, 2026-10-17 a Saturday, 2026-10-18 a Sunday
const at = (day, h, m = 0) => new Date(`2026-10-${day}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
const day = { id: 'tag', name: 'Tag', enabled: true, kinds: ['people'], days: [0, 1, 2, 3, 4, 5, 6], from: '06:00', to: '22:00', cameras: [] };
const night = { id: 'nacht', name: 'Nacht', enabled: true, kinds: ['motion', 'people'], days: [0, 1, 2, 3, 4, 5, 6], from: '22:00', to: '06:00', cameras: [] };

// no rules -> always allowed
assert.equal(popupAllowed({ popupRules: [] }, 'motion', '1', at(17, 12)), true);
assert.equal(popupAllowed({}, 'people', '1', at(17, 12)), true);

// user's example: by day only people, at night both
const app = { popupRules: [day, night] };
assert.equal(popupAllowed(app, 'people', '1', at(17, 12)), true, 'day people');
assert.equal(popupAllowed(app, 'motion', '1', at(17, 12)), false, 'day motion');
assert.equal(popupAllowed(app, 'motion', '1', at(17, 23)), true, 'night motion evening');
assert.equal(popupAllowed(app, 'motion', '1', at(18, 3)), true, 'night motion after midnight');
assert.equal(popupAllowed(app, 'motion', '1', at(17, 6, 0)), false, 'window end is exclusive / day starts');
assert.equal(popupAllowed(app, 'motion', '1', at(17, 5, 59)), true, 'last minute of the night');
assert.equal(popupAllowed(app, 'motion', '1', at(17, 22, 0)), true, 'night starts at 22:00');
assert.equal(popupAllowed(app, 'motion', '1', at(17, 21, 59)), false, 'still day at 21:59');

// disabled rules are ignored, but if ALL rules are disabled the global behaviour (allowed) returns
assert.equal(popupAllowed({ popupRules: [{ ...night, enabled: false }] }, 'motion', '1', at(17, 12)), true);
assert.equal(popupAllowed({ popupRules: [{ ...night, enabled: false }, day] }, 'motion', '1', at(17, 12)), false);

// weekday + overnight: Friday night 22:00-06:00 only
const friNight = { ...night, days: [5] };
assert.equal(popupAllowed({ popupRules: [friNight] }, 'motion', '1', at(16, 23)), true, 'Fri 23:00');
assert.equal(popupAllowed({ popupRules: [friNight] }, 'motion', '1', at(17, 3)), true, 'Sat 03:00 belongs to Friday night');
assert.equal(popupAllowed({ popupRules: [friNight] }, 'motion', '1', at(16, 3)), false, 'Fri 03:00 belongs to Thursday night');
assert.equal(popupAllowed({ popupRules: [friNight] }, 'motion', '1', at(17, 23)), false, 'Sat 23:00');

// whole day (from == to) and camera filter
const camRule = { id: 'c', enabled: true, kinds: ['motion'], days: [], from: '00:00', to: '00:00', cameras: ['21'] };
assert.equal(popupAllowed({ popupRules: [camRule] }, 'motion', '21', at(17, 12)), true);
assert.equal(popupAllowed({ popupRules: [camRule] }, 'motion', '22', at(17, 12)), false);
assert.equal(popupAllowed({ popupRules: [camRule] }, 'people', '21', at(17, 12)), false);

// sanitizing
const clean = sanitizeRules([{ name: 'x', kinds: ['people', 'bogus'], days: [1, 9, 'a'], from: '25:99', to: '07:30', cameras: [21] }, null]);
assert.deepEqual(clean[0].kinds, ['people']);
assert.deepEqual(clean[0].days, [1]);
assert.equal(clean[0].from, '00:00');
assert.equal(clean[0].to, '07:30');
assert.deepEqual(clean[0].cameras, ['21']);
assert.equal(clean.length, 2);
console.log('popup-rules: all tests passed');

