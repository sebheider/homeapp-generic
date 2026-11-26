/**
 * Readings of the kiosk agents: the local datapoints `homeapp.kiosk.<agent>.<key>`, their types and
 * ranges, and the live frames of the presence radar.
 */
import { clampNumber } from '../util/number.js';

export const KIOSK_PREFIX = 'homeapp.kiosk.';
/** True for the local kiosk datapoints (they never go to ioBroker). */
export const isKioskId = (id) => typeof id === 'string' && id.startsWith(KIOSK_PREFIX);

/** Readings an agent may report: key -> [type, name, unit, role]. */
export const KIOSK_VALUES = {
  presence: ['boolean', 'Anwesenheit', '', 'sensor.presence'],
  moving: ['boolean', 'Bewegung', '', 'sensor.motion'],
  still: ['boolean', 'Ruhende Person', '', 'sensor.presence'],
  distance: ['number', 'Abstand', 'cm', 'value.distance'],
  lux: ['number', 'Helligkeit', 'lx', 'value.brightness'],
  co2: ['number', 'CO₂', 'ppm', 'value.co2'],
  temperature: ['number', 'Temperatur', '°C', 'value.temperature'],
  humidity: ['number', 'Luftfeuchte', '%', 'value.humidity'],
  screen: ['boolean', 'Bildschirm an', '', 'indicator'],
  wake: ['boolean', 'Bildschirm zwangsweise an (Zeitplan / Benachrichtigung)', '', 'indicator'],
  brightness: ['number', 'Bildschirmhelligkeit', '%', 'level.brightness'],
  online: ['boolean', 'Agent erreichbar', '', 'indicator.reachable'],
};
const RANGES = { distance: [0, 10000], lux: [0, 200000], co2: [0, 40000], temperature: [-40, 125], humidity: [0, 100], brightness: [0, 100] };

/** Live radar frames: engineering (energy per distance gate), basic (targets only), pin (OUT pin: presence only), none (no data). */
const RADAR_MODES = ['engineering', 'basic', 'pin', 'none'];
const MAX_GATES = 16;

/** Valid agent id ("flur", "kueche-2"), or null. */
export const agentId = (v) => {
  const s = String(v ?? '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,31}$/.test(s) ? s : null;
};

/**
 * Cleans a live frame of a presence radar (see kiosk-agent `radar_payload`): `{mode, presence,
 * moving: {distance cm, energy 0–100} | null, still: … | null, gates: {moving: [], still: []} | null, gateCm, error}`.
 */
export function cleanRadar(r) {
  const src = r && typeof r === 'object' ? r : {};
  const int = (v, min, max) => Math.round(clampNumber(v, min, max, min));
  const target = (t) => (t && typeof t === 'object' && Number.isFinite(Number(t.distance)) ? { distance: int(t.distance, 0, 10000), energy: int(t.energy, 0, 100) } : null);
  const energies = (list) => (Array.isArray(list) ? list.slice(0, MAX_GATES).map((v) => int(v, 0, 100)) : []);
  const gates = src.gates && typeof src.gates === 'object' ? { moving: energies(src.gates.moving), still: energies(src.gates.still) } : null;
  return {
    mode: RADAR_MODES.includes(src.mode) ? src.mode : 'none',
    presence: typeof src.presence === 'boolean' ? src.presence : null,
    moving: target(src.moving),
    still: target(src.still),
    gates: gates && (gates.moving.length || gates.still.length) ? gates : null,
    gateCm: Math.round(clampNumber(src.gateCm, 10, 200, 75)),
    error: src.error ? String(src.error).slice(0, 200) : null,
  };
}

/** Value of one reading in its type and range, or undefined if invalid. */
export function cleanValue(key, v) {
  const [type] = KIOSK_VALUES[key];
  if (v === null || v === undefined) return undefined;
  if (type === 'boolean') return typeof v === 'boolean' ? v : v === 1 || v === 0 ? v === 1 : undefined;
  const n = Number(v);
  if (typeof v === 'boolean' || !Number.isFinite(n)) return undefined;
  const [min, max] = RANGES[key];
  if (n < min || n > max) return undefined;
  return Math.round(n * 10) / 10;
}
