/**
 * Hardware details of a Bambu Lab report: AMS units and spools, fans, nozzles and temperatures.
 */
import { round1 } from '../util/number.js';
import { isObj } from '../util/object.js';
import { trimText } from '../util/text.js';
import { AUX2_FAN_MODELS, CHAMBER_MODELS } from './models.js';
import { num, unpack } from './values.js';

/** German names of the fans (raw speed 0 … 15). */
const FANS = [
  ['cooling_fan_speed', 'part', 'Bauteillüfter'],
  ['big_fan1_speed', 'aux', 'Hilfslüfter'],
  ['big_fan2_speed', 'chamber', 'Kammerlüfter'],
  ['heatbreak_fan_speed', 'heatbreak', 'Hotend-Lüfter'],
];
/** Fan names of the X2D as on its screen. */
const X2D_FANS = { aux: 'Hilfslüfter links', aux2: 'Hilfslüfter rechts', chamber: 'Abluftlüfter' };
const NOZZLE_TYPES = { hardened_steel: 'Gehärteter Stahl', stainless_steel: 'Edelstahl', brass: 'Messing', tungsten_carbide: 'Wolframkarbid', hardened: 'Gehärteter Stahl' };
/** Material digits of the nozzle codes of newer printers (`HS01`). */
const NOZZLE_MATERIALS = { '00': 'Edelstahl', '01': 'Gehärteter Stahl', '05': 'Wolframkarbid' };

/** Fan speed in percent from the raw value 0 … 15 (in steps of 10 %, like Bambu Studio). */
export const fanPercent = (raw) => {
  const n = num(raw);
  return n === null ? null : Math.min(100, Math.ceil(((n / 15) * 100) / 10) * 10);
};

/** Filament colour `RRGGBBAA` as `#rrggbb` (null if missing or invalid). */
const trayColor = (c) => (/^[0-9a-f]{6}/i.test(String(c || '')) ? `#${String(c).slice(0, 6).toLowerCase()}` : null);

/** One AMS slot or external spool; `loaded` = `{ active, nozzle }` from {@link loadedFilament}. */
function readTray(t, loaded) {
  const type = trimText(t.tray_type, 30);
  if (!type) return { id: trimText(t.id, 8), empty: true, ...loaded };
  const remain = num(t.remain);
  return {
    id: trimText(t.id, 8),
    empty: false,
    ...loaded,
    type,
    name: trimText(t.tray_sub_brands, 60) || null,
    color: trayColor(t.tray_color),
    remain: remain !== null && remain >= 0 ? Math.min(100, remain) : null,
    nozzleMin: num(t.nozzle_temp_min),
    nozzleMax: num(t.nozzle_temp_max),
  };
}

const extruderList = (p) => (Array.isArray(p.device?.extruder?.info) ? p.device.extruder.info.filter((e) => isObj(e) && [0, 1].includes(Number(e.id))) : []);

/** Two nozzles (H2D, X2D …): extruder 0 is the right, 1 the left one. */
const isDualNozzle = (p) => extruderList(p).length > 1;

/** Index of the nozzle in use (0 right, 1 left; 15 while switching). */
const activeNozzle = (p) => {
  const s = num(p.device?.extruder?.state);
  return s === null ? 0 : (s >> 4) & 0xf;
};

/**
 * Filament loaded per nozzle as `[{ nozzle, unit, slot }]` (unit 254 / 255 = external spool). Newer
 * printers report it per extruder (`snow` = unit << 8 | slot, 0xFFFF = none), older ones in
 * `ams.tray_now` (unit * 4 + slot, AMS HT 128 …, 254 = external spool, 255 = none).
 */
function loadedFilament(p = {}) {
  const extruders = extruderList(p).filter((e) => num(e.snow) !== null);
  if (extruders.length) {
    return extruders
      .map((e) => ({ nozzle: Number(e.id), unit: num(e.snow) >> 8, slot: num(e.snow) & 0xff }))
      .filter((l) => l.slot !== 0xff);
  }
  const now = num(p.ams?.tray_now);
  if (now === null || now === 255) return [];
  if (now === 254) return [{ nozzle: 0, unit: 254, slot: 0 }];
  return [now >= 128 ? { nozzle: 0, unit: now, slot: 0 } : { nozzle: 0, unit: now >> 2, slot: now & 3 }];
}

/**
 * AMS units with their slots and the external spools (`vir_slot` of the dual-nozzle printers: 254 left,
 * 255 right – older printers: `vt_tray`). `active` marks the spool of the nozzle in use; `nozzle`
 * tells dual-nozzle printers which side a spool feeds.
 */
export function readAms(p = {}) {
  const dual = isDualNozzle(p);
  const loaded = loadedFilament(p);
  const current = activeNozzle(p);
  const mark = (match) => {
    const l = loaded.filter(match);
    return { active: l.some((x) => x.nozzle === current), nozzle: dual && l.length ? (l[0].nozzle === 0 ? 'right' : 'left') : null };
  };
  const units = (Array.isArray(p.ams?.ams) ? p.ams.ams : []).filter(isObj).map((u) => {
    const id = num(u.id) ?? 0;
    const humidityRaw = num(u.humidity_raw);
    const temp = num(u.temp);
    return {
      id,
      name: id >= 128 ? `AMS HT ${id - 127}` : `AMS ${String.fromCharCode(65 + (id % 26))}`,
      humidity: humidityRaw !== null && humidityRaw > 0 ? humidityRaw : null,
      humidityLevel: num(u.humidity),
      temp: temp !== null && temp > 0 ? round1(temp) : null,
      trays: (Array.isArray(u.tray) ? u.tray : []).filter(isObj).map((t) => readTray(t, mark((l) => l.unit === id && l.slot === num(t.id)))),
    };
  });
  const slots = Array.isArray(p.vir_slot) ? p.vir_slot.filter(isObj) : isObj(p.vt_tray) ? [p.vt_tray] : [];
  const external = slots
    .map((t) => {
      const id = num(t.id);
      const label = dual && id === 254 ? 'Extern links' : dual && id === 255 ? 'Extern rechts' : 'Extern';
      return { ...readTray(t, mark((l) => l.unit >= 254 && (slots.length === 1 || l.unit === id))), label };
    })
    .filter((t) => !t.empty)
    .sort((a, b) => Number(a.id) - Number(b.id));
  return { units, external };
}

/** Fans in percent; the X2D names them like its screen (left / right aux fan, exhaust fan). */
export function readFans(p = {}, model = null) {
  const fans = FANS.filter(([k]) => p[k] !== undefined).map(([k, key, label]) => ({ key, label, percent: fanPercent(p[k]) }));
  const parts = AUX2_FAN_MODELS.has(model) && Array.isArray(p.device?.airduct?.parts) ? p.device.airduct.parts : [];
  const aux2 = parts.find((x) => isObj(x) && Number(x.id) === 160);
  if (aux2) {
    const v = num(aux2.state);
    const at = fans.findIndex((f) => f.key === 'aux');
    fans.splice(at < 0 ? fans.length : at + 1, 0, { key: 'aux2', label: 'Hilfslüfter 2', percent: v !== null && v >= 0 && v <= 100 ? v : null });
  }
  if (model === 'X2D') for (const f of fans) f.label = X2D_FANS[f.key] ?? f.label;
  return fans;
}

/** German nozzle type from `hardened_steel` or the codes of newer printers (`HS01`: 2nd letter H/E high flow, U TPU). */
export function nozzleTypeName(v) {
  const s = trimText(v, 40);
  if (!s) return null;
  if (NOZZLE_TYPES[s]) return NOZZLE_TYPES[s];
  const m = /^[A-Z]([A-Z])(\d\d)/i.exec(s);
  if (!m) return s;
  const flow = m[1].toUpperCase();
  if (flow === 'U') return 'TPU High Flow';
  const material = NOZZLE_MATERIALS[m[2]];
  if (!material) return s;
  return flow === 'H' || flow === 'E' ? `${material} (High Flow)` : material;
}

/** Nozzle(s) with diameter and type; `active` (only with two nozzles) marks the one in use. */
export function readNozzles(p = {}) {
  const info = Array.isArray(p.device?.nozzle?.info) ? p.device.nozzle.info.filter((n) => isObj(n) && [0, 1].includes(Number(n.id))) : [];
  if (info.length > 1 && isDualNozzle(p)) {
    const current = activeNozzle(p);
    return info
      .sort((a, b) => Number(a.id) - Number(b.id))
      .map((n) => ({ label: Number(n.id) === 0 ? 'Düse rechts' : 'Düse links', diameter: num(n.diameter) || null, type: nozzleTypeName(n.type), active: Number(n.id) === current }))
      .filter((n) => n.diameter || n.type);
  }
  const diameter = num(p.nozzle_diameter) || num(info[0]?.diameter) || null;
  const type = nozzleTypeName(p.nozzle_type) ?? nozzleTypeName(info[0]?.type);
  return diameter || type ? [{ label: 'Düse', diameter, type, active: null }] : [];
}

/** Temperatures: nozzle(s), bed and – where the model has a sensor – chamber. */
export function readBambuTemps(p, model) {
  const out = [];
  const add = (key, label, actual, target) => {
    if (actual === null) return;
    out.push({ key, label, actual: round1(actual), target: target === null ? null : round1(target) });
  };
  const extruders = p.device?.extruder?.info;
  if (Array.isArray(extruders) && extruders.some((e) => isObj(e) && e.temp !== undefined)) {
    const list = extruders.filter((e) => isObj(e) && unpack(e.temp) && [0, 1].includes(Number(e.id)));
    for (const e of list.sort((a, b) => Number(a.id) - Number(b.id))) {
      const t = unpack(e.temp);
      add(`tool${Number(e.id)}`, list.length > 1 ? (Number(e.id) === 0 ? 'Düse rechts' : 'Düse links') : 'Düse', t.actual, t.target);
    }
  } else add('tool0', 'Düse', num(p.nozzle_temper), num(p.nozzle_target_temper));
  const bed = unpack(p.device?.bed?.info?.temp);
  if (bed) add('bed', 'Bett', bed.actual, bed.target);
  else add('bed', 'Bett', num(p.bed_temper), num(p.bed_target_temper));
  const ctc = unpack(p.device?.ctc?.info?.temp);
  if (ctc) add('chamber', 'Kammer', ctc.actual, ctc.target || null);
  else if (CHAMBER_MODELS.has(model)) add('chamber', 'Kammer', num(p.chamber_temper), null);
  return out;
}
