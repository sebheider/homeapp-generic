/**
 * Names, ids, icons and rooms of discovered devices.
 */

/** "Küche Süd" -> "kueche_sued" (ids for rooms and devices). */
export const slug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

/** Icon suggestion for a room, derived from its name. */
const ROOM_ICONS = [
  [/wohn/i, 'sofa'],
  [/küche|kueche/i, 'cooking'],
  [/ess/i, 'utensils'],
  [/schlaf/i, 'bed'],
  [/büro|buero/i, 'desk'],
  [/bad/i, 'bath'],
  [/gäste|gaeste|wc/i, 'shower'],
  [/garten|außen|aussen|terrasse|terasse|mauer|beet/i, 'trees'],
  [/keller|garage/i, 'garage'],
  [/technik|heiz/i, 'cpu'],
  [/wetter/i, 'sun'],
  [/flur|diele|treppe/i, 'home'],
];
const roomIcon = (name) => ROOM_ICONS.find(([re]) => re.test(name))?.[1] || 'home';

/** Room guess for names that do not carry an explicit room (e.g. Hue lamp names). */
const ROOM_KEYWORDS = [
  [/esstisch|esszimmer/i, 'Esszimmer'],
  [/wohnzimmer|kugel|tv|stehlampe/i, 'Wohnzimmer'],
  [/küche|kueche|schrank|milch|kaffee/i, 'Küche'],
  [/keller/i, 'Keller'],
  [/garten|mauer|terasse|terrasse|blumenbeet|trockenmauer|außen|aussen/i, 'Außen'],
  [/schlaf/i, 'Schlafzimmer'],
  [/büro|buero/i, 'Büro'],
  [/bad/i, 'Badezimmer'],
];
export const guessRoom = (text) => ROOM_KEYWORDS.find(([re]) => re.test(text))?.[1] || 'Sonstiges';

/** Icon suggestion for a Hue scene, derived from its label. */
const SCENE_ICONS = [
  [/nacht/i, 'moon'],
  [/film|honolulu/i, 'clapperboard'],
  [/lesen|konzentr/i, 'desk'],
];
export const sceneIcon = (label) => SCENE_ICONS.find(([re]) => re.test(label))?.[1] || 'light';

/** Parent of an ioBroker id (everything before the last dot). */
export const parentOf = (id) => id.slice(0, id.lastIndexOf('.'));

/** The first three segments of an id: adapter, instance and device ("hm-rpc.0.ABC123"). */
export const deviceOf = (id) => id.split('.').slice(0, 3).join('.');

/** "EG - Küche - Rollade:4.LEVEL" -> { floor: 'EG', room: 'Küche', device: 'Rollade' } */
export function parseHmName(name) {
  const clean = String(name || '').replace(/:\d+\..*$/, '');
  const m = clean.match(/^(EG|OG|KG|DG)\s*-\s*(.+?)\s*-\s*(.+)$/);
  if (m) return { floor: m[1], room: m[2].trim(), device: m[3].trim() };
  return { floor: null, room: null, device: clean.trim() };
}

/**
 * Collects rooms while devices are being added. A room name that exists on
 * several floors (e.g. "Flur" on EG and KG) is shown with its floor appended.
 */
export class RoomBook {
  constructor() {
    this.floorsByRoom = new Map();
  }

  /** Registers a room and returns a lazy key that is resolved in {@link resolve}. */
  key(room, floor) {
    room = room || 'Sonstiges';
    const set = this.floorsByRoom.get(room) || new Set();
    if (floor) set.add(floor);
    this.floorsByRoom.set(room, set);
    return { room, floor };
  }

  /** Final room ({ id, name, icon }) of a key, once all rooms are known. */
  resolve(k) {
    const floors = this.floorsByRoom.get(k.room);
    const name = floors && floors.size > 1 && k.floor ? `${k.room} ${k.floor}` : k.room;
    return { id: slug(name), name, icon: roomIcon(k.room) };
  }
}
