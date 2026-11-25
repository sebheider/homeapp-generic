/**
 * 3D printer from Bambu Lab (X1, X2, P1, A1, H2, P2 series) via the local developer API.
 *
 * The printer has to be in LAN mode with developer mode switched on (printer → Settings → LAN only /
 * Developer mode); the access code is shown there as well. The server then talks to the printer itself:
 *   - MQTT over TLS on port 8883 (user `bblp`, password = access code, self-signed certificate):
 *     subscribe `device/<serial>/report`, send commands to `device/<serial>/request`. After connecting
 *     `get_version` (model, firmware) and `pushall` (complete state) are requested; afterwards P1/A1
 *     printers only send the changed fields, so every report is merged into the full state
 *     ({@link mergeReport}).
 *   - Webcam (see {@link FrameCamera}):
 *       P1 / A1 series: JPEG pictures over TLS on port 6000 (80 byte login, then per picture a 16 byte
 *       header with the size followed by the JPEG),
 *       X1 / X2 / H2 / P2 series: RTSPS on port 322, converted to MJPEG by ffmpeg ("LAN-Liveview" must be on),
 *       or the address of an own MJPEG stream (e.g. go2rtc).
 *   - Control (pause, resume, stop, chamber light, speed level) through MQTT commands.
 * Bambu printers keep no temperature history, so the last 30 minutes are recorded here.
 *
 * {@link BambuSource} offers the same interface as the OctoPrint source (read, temps, snapshot,
 * openStream, close) plus `command` and `describe`, so {@link PrinterService} (octoprint.js) runs both.
 */
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import { spawn as spawnProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { MqttClient } from './mqtt.js';
import { MjpegParser, boundaryOf } from './mjpeg.js';

export const BAMBU_CAMERAS = ['auto', 'jpeg', 'rtsp', 'url', 'off'];
export const MQTT_PORT = 8883;
export const JPEG_PORT = 6000;
export const RTSP_PORT = 322;
/** print_error of a print cancelled by the user (0300_400C). */
export const CANCELLED_ERROR = 0x0300400c;
/** Speed levels of the `print_speed` command. */
export const SPEED_LEVELS = { 1: 'Leise', 2: 'Standard', 3: 'Sport', 4: 'Ludicrous' };

const TEMP_KEEP_MS = 30 * 60000;
const TEMP_STEP_MS = 10000;
const FIRST_REPORT_MS = 15000;
const QUIET_PUSHALL_MS = 60000;
const QUIET_RECONNECT_MS = 150000;
const MAX_RETRY_MS = 30000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const FRAME_BOUNDARY = 'bambuframe';
/** Models that report the chamber temperature (others send a meaningless value). */
const CHAMBER_MODELS = new Set(['X1', 'X1C', 'X1E', 'H2D', 'H2DPRO', 'H2S', 'H2C', 'H3C', 'X2D', 'P2S']);
/** Models whose camera is an RTSPS stream (the others send JPEG pictures on port 6000). */
const RTSP_MODELS = new Set(['X1', 'X1C', 'X1E', 'H2D', 'H2DPRO', 'H2S', 'H2C', 'H3C', 'X2D', 'P2S']);
/** Models with a second chamber light (`chamber_light2`), switched together with the first. */
const LIGHT2_MODELS = new Set(['H2D', 'H2DPRO', 'H2S', 'H2C']);
/** Models with a second aux fan, reported as percent in `device.airduct.parts` (id 160). */
const AUX2_FAN_MODELS = new Set(['P2S', 'X2D']);

const text = (v, max) => String(v ?? '').trim().slice(0, max);
const num = (v) => {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const round1 = (v) => (v === null ? null : Math.round(v * 10) / 10);
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Cleans the `bambu` section of the configuration (connection of a Bambu Lab printer). */
export function sanitizeBambu(o = {}) {
  const src = isObj(o) ? o : {};
  // a pasted address ("http://192.168.1.50:8883/") is reduced to the host
  const host = text(src.host, 200)
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/[/?#\s].*$/, '')
    .replace(/:\d+$/, '');
  return {
    host,
    serial: text(src.serial, 40).toUpperCase().replace(/[^A-Z0-9]/g, ''),
    accessCode: text(src.accessCode, 40),
    camera: BAMBU_CAMERAS.includes(src.camera) ? src.camera : 'auto',
    streamUrl: text(src.streamUrl, 500),
    controls: src.controls !== false,
  };
}

/**
 * Merges a (partial) report into the known state. Objects are merged deeply; lists of objects with
 * an `id` (AMS units, trays) are merged by id – an entry with nothing but its id is an empty slot and
 * replaces the old one. Other lists replace the old ones.
 */
export function mergeReport(base, patch) {
  if (!isObj(patch)) return base;
  const out = isObj(base) ? { ...base } : {};
  for (const [k, v] of Object.entries(patch)) {
    const old = out[k];
    if (isObj(v) && isObj(old)) out[k] = mergeReport(old, v);
    else if (Array.isArray(v) && Array.isArray(old) && v.length && v.every((e) => isObj(e) && e.id !== undefined)) {
      const merged = old.filter((e) => isObj(e)).map((e) => ({ ...e }));
      for (const e of v) {
        const i = merged.findIndex((m) => String(m.id) === String(e.id));
        const empty = Object.keys(e).length === 1;
        if (i < 0) merged.push(e);
        else merged[i] = empty ? e : mergeReport(merged[i], e);
      }
      out[k] = merged;
    } else out[k] = v;
  }
  return out;
}

/**
 * Normalised state from `gcode_state`: PREPARE / SLICING count as printing (heating, levelling …),
 * FINISH as idle; FAILED is an error unless the user cancelled the print.
 */
export function bambuState(gcodeState, cancelled = false) {
  switch (String(gcodeState || '').toUpperCase()) {
    case 'RUNNING':
    case 'PREPARE':
    case 'SLICING':
      return 'printing';
    case 'PAUSE':
      return 'paused';
    case 'FINISH':
    case 'IDLE':
      return 'idle';
    case 'FAILED':
      return cancelled ? 'idle' : 'error';
    case 'INIT':
      return 'connecting';
    case 'OFFLINE':
      return 'offline';
    default:
      return 'unknown';
  }
}

/** German text of `gcode_state`. */
export const GCODE_STATE_TEXT = {
  IDLE: 'Bereit',
  PREPARE: 'Vorbereitung',
  SLICING: 'Slicen',
  RUNNING: 'Druckt',
  PAUSE: 'Pausiert',
  FINISH: 'Fertig',
  FAILED: 'Fehlgeschlagen',
  INIT: 'Startet',
  OFFLINE: 'Offline',
};

/** German labels of the print stages (`stg_cur`). */
export const STAGES = {
  0: 'Druckt',
  1: 'Bett-Nivellierung',
  2: 'Heizbett vorheizen',
  3: 'Vibrationskompensation',
  4: 'Filamentwechsel',
  5: 'Pause (M400)',
  6: 'Pause: Filament leer',
  7: 'Düse aufheizen',
  8: 'Extrusion kalibrieren',
  9: 'Druckbett scannen',
  10: 'Erste Schicht prüfen',
  11: 'Druckplatte erkennen',
  12: 'Mikro-Lidar kalibrieren',
  13: 'Druckkopf referenzieren',
  14: 'Düsenspitze reinigen',
  15: 'Extrudertemperatur prüfen',
  16: 'Vom Benutzer pausiert',
  17: 'Pause: Frontabdeckung gefallen',
  18: 'Mikro-Lidar kalibrieren',
  19: 'Flussrate kalibrieren',
  20: 'Pause: Düsentemperatur gestört',
  21: 'Pause: Heizbetttemperatur gestört',
  22: 'Filament entladen',
  23: 'Pause: Schrittverlust',
  24: 'Filament laden',
  25: 'Motorgeräusch kalibrieren',
  26: 'Pause: AMS verloren',
  27: 'Pause: Hotend-Lüfter zu langsam',
  28: 'Pause: Kammertemperatur gestört',
  29: 'Kammer kühlen',
  30: 'Pause durch G-Code',
  31: 'Motorgeräusch-Vorführung',
  32: 'Pause: Düse mit Filament bedeckt',
  33: 'Pause: Schneidwerkfehler',
  34: 'Pause: Fehler in der ersten Schicht',
  35: 'Pause: Düse verstopft',
  39: 'Düsenversatz kalibrieren',
  40: 'Bett-Nivellierung (heiß)',
  41: 'Schnellverschluss prüfen',
  42: 'Tür und Abdeckung prüfen',
  47: 'Bett-Nivellierung (Phase 1)',
  48: 'Bett-Nivellierung (Phase 2)',
  49: 'Kammer heizen',
  50: 'Heizbett abkühlen',
  51: 'Kalibrierlinien drucken',
  52: 'Material prüfen',
  54: 'Warten auf Heizbett-Temperatur',
  55: 'Materialposition prüfen',
  64: 'Hotend vorbereiten',
  69: 'Düse kühlen',
  76: 'Vorextrusion',
  77: 'AMS vorbereiten',
};

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
const HMS_SEVERITY = { 1: 'fatal', 2: 'serious', 3: 'common', 4: 'info' };

/** Fan speed in percent from the raw value 0 … 15 (in steps of 10 %, like Bambu Studio). */
export const fanPercent = (raw) => {
  const n = num(raw);
  return n === null ? null : Math.min(100, Math.ceil(((n / 15) * 100) / 10) * 10);
};

/** Low word = current, high word = target value (newer firmware packs both into one number). */
const unpack = (v) => {
  const n = num(v);
  return n === null ? null : { actual: n & 0xffff, target: (n >> 16) & 0xffff };
};

/** Error code as `0300_400C`. */
export const errorCode = (n) => {
  const h = (Number(n) >>> 0).toString(16).toUpperCase().padStart(8, '0');
  return `${h.slice(0, 4)}_${h.slice(4)}`;
};

/** HMS messages as `{ code: '0300_0100_0001_0007', severity }`. */
export function hmsList(hms) {
  if (!Array.isArray(hms)) return [];
  return hms
    .filter((e) => isObj(e) && num(e.attr) !== null && num(e.code) !== null)
    .map((e) => {
      const attr = (Number(e.attr) >>> 0).toString(16).toUpperCase().padStart(8, '0');
      const code = (Number(e.code) >>> 0).toString(16).toUpperCase().padStart(8, '0');
      return { code: `${attr.slice(0, 4)}_${attr.slice(4)}_${code.slice(0, 4)}_${code.slice(4)}`, severity: HMS_SEVERITY[Number(e.code) >>> 16] ?? 'unknown' };
    });
}

/** Model code (X1C, P1S, A1MINI …) from the modules of `get_version`, null if unknown. */
export function modelFromModules(modules) {
  const list = Array.isArray(modules) ? modules.filter(isObj) : [];
  const products = {
    'Bambu Lab A1': 'A1', 'Bambu Lab A1 mini': 'A1MINI', 'Bambu Lab A2L': 'A2L', 'Bambu Lab P1P': 'P1P', 'Bambu Lab P1S': 'P1S', 'Bambu Lab P2S': 'P2S',
    'Bambu Lab H2C': 'H2C', 'Bambu Lab H3C': 'H3C', 'Bambu Lab H2D': 'H2D', 'Bambu Lab H2D Pro': 'H2DPRO', 'Bambu Lab H2S': 'H2S', 'Bambu Lab X2D': 'X2D',
    'Bambu Lab X1 Carbon': 'X1C', 'Bambu Lab X1E': 'X1E', 'Bambu Lab X1': 'X1',
  };
  for (const m of list) if (products[m.product_name]) return products[m.product_name];
  const ap = list.find((m) => String(m.hw_ver || '').startsWith('AP0'));
  if (!ap) return null;
  if (ap.hw_ver === 'AP02') return 'X1E';
  if (ap.project_name === 'N1') return 'A1MINI';
  if (ap.project_name === 'N2S') return 'A1';
  if (ap.project_name === 'C11') return 'P1P';
  if (ap.project_name === 'C12') return 'P1S';
  if (ap.hw_ver === 'AP05' && ap.name === 'rv1126') return 'X1C';
  return null;
}

/** Display name of a model code: `A1MINI` -> `A1 mini`. */
export const modelName = (code) => ({ A1MINI: 'A1 mini', H2DPRO: 'H2D Pro', X1C: 'X1 Carbon' })[code] ?? code;

/** Firmware version (module `ota`) from `get_version`. */
export const firmwareOf = (modules) => (Array.isArray(modules) ? text(modules.find((m) => m?.name === 'ota')?.sw_ver, 40) || null : null);

/** Filament colour `RRGGBBAA` as `#rrggbb` (null if missing or invalid). */
const trayColor = (c) => (/^[0-9a-f]{6}/i.test(String(c || '')) ? `#${String(c).slice(0, 6).toLowerCase()}` : null);

/** One AMS slot or external spool; `loaded` = `{ active, nozzle }` from {@link loadedFilament}. */
function readTray(t, loaded) {
  const type = text(t.tray_type, 30);
  if (!type) return { id: text(t.id, 8), empty: true, ...loaded };
  const remain = num(t.remain);
  return {
    id: text(t.id, 8),
    empty: false,
    ...loaded,
    type,
    name: text(t.tray_sub_brands, 60) || null,
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
  const s = text(v, 40);
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

/**
 * Printer state in the shape of the OctoPrint source plus the Bambu details (`bambu`) from the merged
 * report. `ctx`: `{ model, firmware, cancelled, printTime, camera, serial }`.
 */
export function normalizeBambu(p = {}, ctx = {}) {
  const gs = String(p.gcode_state || '').toUpperCase();
  const state = bambuState(gs, ctx.cancelled);
  const active = state === 'printing' || state === 'paused';
  const file = text(p.subtask_name, 200) || text(String(p.gcode_file || '').split('/').pop(), 200);
  const completion = num(p.mc_percent);
  const left = num(p.mc_remaining_time);
  const layerTotal = num(p.total_layer_num);
  const stageId = num(p.stage?._id ?? p.stg_cur);
  const printError = num(p.print_error) ?? 0;
  const lights = Array.isArray(p.lights_report) ? p.lights_report.filter(isObj) : [];
  const chamberLights = lights.filter((l) => l.node === 'chamber_light' || l.node === 'chamber_light2');
  const wifi = num(String(p.wifi_signal ?? '').replace(/dBm$/i, ''));
  const speed = num(p.spd_lvl);
  const hasJob = Boolean(file) && gs !== 'IDLE';
  return {
    state,
    stateText: GCODE_STATE_TEXT[gs] ?? gs,
    printerError: printError && printError !== CANCELLED_ERROR ? `Druckerfehler ${errorCode(printError)}` : null,
    job: hasJob
      ? {
          file,
          path: text(p.gcode_file, 300) || file,
          origin: p.print_type === 'cloud' ? 'cloud' : 'sdcard',
          size: null,
          user: null,
          estimatedPrintTime: null,
          filament: null,
        }
      : null,
    progress: hasJob
      ? {
          completion: completion === null ? null : Math.min(100, Math.max(0, completion)),
          printTime: ctx.printTime ?? null,
          printTimeLeft: left === null ? null : active ? left * 60 : 0,
          printTimeLeftOrigin: null,
        }
      : null,
    temps: readBambuTemps(p, ctx.model),
    bambu: {
      model: ctx.model ? modelName(ctx.model) : null,
      firmware: ctx.firmware ?? null,
      serial: ctx.serial ?? null,
      stage: active && stageId !== null && stageId >= 0 && stageId !== 255 ? STAGES[stageId] ?? `Schritt ${stageId}` : null,
      layer: layerTotal ? { current: num(p.layer_num) ?? 0, total: layerTotal } : null,
      speed: speed ? { level: speed, label: SPEED_LEVELS[speed] ?? `Stufe ${speed}`, percent: num(p.spd_mag) } : null,
      fans: readFans(p, ctx.model),
      light: chamberLights.length ? chamberLights.some((l) => l.mode !== 'off') : null,
      ams: readAms(p),
      hms: hmsList(p.hms),
      wifi,
      nozzles: readNozzles(p),
      sdcard: typeof p.sdcard === 'boolean' ? p.sdcard : null,
      timelapse: p.ipcam ? p.ipcam.timelapse === 'enable' : null,
      camera: ctx.camera ?? null,
    },
  };
}

/** Camera kind for the setting and the report: `jpeg`, `rtsp`, `url`, `off` – or `disabled` (X1: LAN live view off). */
export function cameraKind(setting, report, model) {
  if (setting !== 'auto') return setting;
  const rtsp = report?.ipcam?.rtsp_url;
  if (typeof rtsp === 'string' && /^rtsps?:/i.test(rtsp)) return 'rtsp';
  if (rtsp === 'disable') return 'disabled';
  return RTSP_MODELS.has(model) ? 'rtsp' : 'jpeg';
}

/** The 80 byte login of the JPEG camera (port 6000). */
export function jpegAuthPacket(accessCode) {
  const b = Buffer.alloc(80);
  b.writeUInt32LE(0x40, 0);
  b.writeUInt32LE(0x3000, 4);
  b.write('bblp', 16, 32, 'ascii');
  b.write(String(accessCode), 48, 32, 'ascii');
  return b;
}

/** Splits the byte stream of the JPEG camera into pictures (16 byte header with the size, then the JPEG). */
export class JpegFrameParser {
  constructor(onFrame) {
    this.onFrame = onFrame;
    this.buf = Buffer.alloc(0);
  }

  push(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    while (this.buf.length >= 16) {
      const size = this.buf.readUInt32LE(0);
      if (size < 4 || size > MAX_IMAGE_BYTES) throw new Error('Unerwartete Daten von der Kamera');
      if (this.buf.length < 16 + size) return;
      const body = Buffer.from(this.buf.subarray(16, 16 + size));
      this.buf = this.buf.subarray(16 + size);
      if (body[0] === 0xff && body[1] === 0xd8) this.onFrame({ type: 'image/jpeg', body });
    }
  }
}

/* ------------------------------------------------------------------ camera */

/**
 * Picture source that runs only while somebody wants pictures: it is started by a snapshot request or
 * a stream viewer, keeps the newest frame, reconnects with a growing pause and stops `idleMs` after
 * the last request when nobody watches the stream any more.
 * `open(onFrame, onEnd)` starts a producer and returns `{ close() }`.
 */
export class FrameCamera {
  constructor(open, { idleMs = 30000, freshMs = 4000, waitMs = 15000 } = {}) {
    this.open = open;
    this.idleMs = idleMs;
    this.freshMs = freshMs;
    this.waitMs = waitMs;
    this.events = new EventEmitter();
    this.events.setMaxListeners(50);
    this.last = null;
    this.producer = null;
    this.retry = null;
    this.delay = 0;
    this.viewers = 0;
    this.touched = 0;
    this.error = null;
    this.closed = false;
    this.idle = setInterval(() => this.checkIdle(), Math.min(5000, idleMs));
    this.idle.unref?.();
  }

  checkIdle() {
    if (this.viewers || Date.now() - this.touched < this.idleMs) return;
    this.stop();
  }

  start() {
    if (this.closed || this.producer || this.retry) return;
    let got = false;
    let ended = false;
    const onFrame = (frame) => {
      if (ended) return;
      got = true;
      this.delay = 0;
      this.error = null;
      this.last = { ...frame, ts: Date.now() };
      this.events.emit('frame', this.last);
    };
    const onEnd = (err) => {
      if (ended) return;
      ended = true;
      if (this.producer === handle) this.producer = null;
      if (err) {
        this.error = err;
        this.events.emit('fail', err);
      }
      if (this.closed || (!this.viewers && Date.now() - this.touched >= this.idleMs)) return;
      // a source that delivered pictures (e.g. a snapshot address) is asked again soon
      this.delay = got ? 1000 : Math.min(MAX_RETRY_MS, this.delay ? this.delay * 2 : 2000);
      this.retry = setTimeout(() => {
        this.retry = null;
        this.start();
      }, this.delay);
      this.retry.unref?.();
    };
    const handle = { close() {} };
    this.producer = handle;
    try {
      Object.assign(handle, this.open(onFrame, onEnd));
    } catch (err) {
      onEnd(err);
    }
  }

  stop() {
    clearTimeout(this.retry);
    this.retry = null;
    const p = this.producer;
    this.producer = null;
    p?.close();
  }

  /** The newest picture (waits for the next one if the last is older than `freshMs`). */
  frame() {
    this.touched = Date.now();
    if (this.last && Date.now() - this.last.ts < this.freshMs) return Promise.resolve(this.last);
    this.start();
    return new Promise((resolve, reject) => {
      const done = (fn, v) => {
        clearTimeout(timer);
        this.events.off('frame', onFrame);
        this.events.off('fail', onFail);
        fn(v);
      };
      const onFrame = (f) => done(resolve, f);
      const onFail = (err) => done(reject, err);
      const timer = setTimeout(() => done(reject, this.error ?? new Error('Kein Bild von der Kamera (Zeitüberschreitung)')), this.waitMs);
      timer.unref?.();
      this.events.on('frame', onFrame);
      this.events.on('fail', onFail);
    });
  }

  /** MJPEG stream (a readable with multipart headers, like an http response) for the MjpegHub. */
  async openStream() {
    await this.frame();
    const out = new PassThrough();
    out.headers = { 'content-type': `multipart/x-mixed-replace; boundary=${FRAME_BOUNDARY}` };
    const write = (f) => {
      out.write(Buffer.concat([Buffer.from(`--${FRAME_BOUNDARY}\r\nContent-Type: ${f.type}\r\nContent-Length: ${f.body.length}\r\n\r\n`), f.body, Buffer.from('\r\n')]));
    };
    this.viewers++;
    if (this.last) write(this.last);
    this.events.on('frame', write);
    out.on('close', () => {
      this.viewers--;
      this.touched = Date.now();
      this.events.off('frame', write);
    });
    return out;
  }

  close() {
    this.closed = true;
    clearInterval(this.idle);
    this.stop();
    this.events.removeAllListeners();
  }
}

/** Producer for the JPEG camera of the P1 / A1 series (TLS, port 6000). */
export function jpegProducer({ host, accessCode, port = JPEG_PORT, connect = tls.connect }) {
  return (onFrame, onEnd) => {
    let got = false;
    const sock = connect({ host, port, rejectUnauthorized: false });
    const parser = new JpegFrameParser((f) => {
      got = true;
      onFrame(f);
    });
    sock.setTimeout(20000, () => sock.destroy(Object.assign(new Error('Kamera antwortet nicht'), { code: 'ETIMEDOUT' })));
    sock.once('secureConnect', () => sock.write(jpegAuthPacket(accessCode)));
    sock.once('connect', () => {
      if (!sock.encrypted) sock.write(jpegAuthPacket(accessCode)); // plain socket in tests
    });
    sock.on('data', (chunk) => {
      try {
        parser.push(chunk);
      } catch (err) {
        sock.destroy(err);
      }
    });
    let error = null;
    sock.on('error', (err) => (error = err));
    sock.on('close', () => onEnd(error ?? (got ? null : new Error('Kamera hat die Verbindung beendet – Zugangscode prüfen'))));
    return { close: () => sock.destroy() };
  };
}

/** Producer that converts the RTSPS stream (X1 / H2 / P2 series) with ffmpeg to JPEG pictures. */
export function rtspProducer({ url, fps = 5, spawn = spawnProcess }) {
  return (onFrame, onEnd) => {
    const boundary = 'homeappffmpeg';
    let stderr = '';
    let proc;
    try {
      proc = spawn('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-nostdin',
        '-rtsp_transport', 'tcp', '-timeout', '10000000',
        '-i', url,
        '-an', '-vf', `fps=${fps},scale='min(1280,iw)':-2`, '-q:v', '6',
        '-f', 'mpjpeg', '-boundary_tag', boundary, 'pipe:1',
      ], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      onEnd(err);
      return { close() {} };
    }
    const parser = new MjpegParser(boundary, onFrame);
    proc.stdout.on('data', (c) => parser.push(c));
    proc.stderr.on('data', (c) => (stderr = (stderr + c).slice(-600)));
    let error = null;
    proc.on('error', (err) => {
      error = err.code === 'ENOENT' ? new Error('ffmpeg ist nicht installiert – für die Kamera der X1-/H2-/P2-Serie nötig (im Docker-Image enthalten)') : err;
    });
    proc.on('close', (code) => {
      const msg = stderr.trim().split('\n').pop()?.replace(/rtsps?:\/\/[^@\s]*@/gi, 'rtsps://') || `ffmpeg beendet (${code})`;
      onEnd(error ?? new Error(/401|unauthori/i.test(msg) ? 'Kamera: Zugangscode abgelehnt' : `Kamera: ${msg}`));
    });
    return { close: () => proc.kill('SIGKILL') };
  };
}

/** Producer for an own MJPEG stream (or a snapshot address, which is read again and again). */
export function urlProducer({ url }) {
  return (onFrame, onEnd) => {
    let req;
    try {
      const u = new URL(url);
      const lib = u.protocol === 'https:' ? https : http;
      req = lib.get(u, { rejectUnauthorized: false, timeout: 15000 }, (res) => {
        const type = String(res.headers['content-type'] || '');
        if (res.statusCode !== 200) {
          res.destroy();
          return onEnd(new Error(`Kamera-Adresse antwortet mit HTTP ${res.statusCode}`));
        }
        if (type.startsWith('image/')) {
          const chunks = [];
          let size = 0;
          res.on('data', (c) => {
            size += c.length;
            if (size > MAX_IMAGE_BYTES) res.destroy();
            else chunks.push(c);
          });
          res.on('end', () => {
            onFrame({ type: type.split(';')[0], body: Buffer.concat(chunks) });
            onEnd(null);
          });
          res.on('error', onEnd);
          return;
        }
        const boundary = boundaryOf(type);
        if (!boundary) {
          res.destroy();
          return onEnd(new Error('Kamera-Adresse liefert weder MJPEG noch ein Bild'));
        }
        const parser = new MjpegParser(boundary, onFrame);
        res.on('data', (c) => parser.push(c));
        res.on('close', () => onEnd(null));
        res.on('error', onEnd);
      });
      req.on('timeout', () => req.destroy(Object.assign(new Error('Kamera-Adresse antwortet nicht'), { code: 'ETIMEDOUT' })));
      req.on('error', onEnd);
    } catch (err) {
      onEnd(err);
      return { close() {} };
    }
    return { close: () => req.destroy() };
  };
}

/* ------------------------------------------------------------------ source */

/** German explanation of a connection problem with the printer. */
export function bambuMessage(err) {
  const code = String(err?.code || '');
  if (code === 'MQTT_CONNACK') return 'Zugangscode abgelehnt – Zugangscode prüfen (Drucker → Einstellungen → LAN-Modus) und Entwicklermodus einschalten';
  if (code === 'NO_REPORT') return 'Verbunden, aber keine Daten vom Drucker – Seriennummer prüfen';
  if (code === 'ECONNREFUSED') return 'Drucker lehnt die Verbindung ab – LAN-Modus und Entwicklermodus einschalten, IP-Adresse prüfen';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'Host nicht gefunden – Adresse prüfen';
  if (['EHOSTUNREACH', 'ENETUNREACH', 'ETIMEDOUT', 'ECONNRESET'].includes(code)) return 'Drucker nicht erreichbar – ist er eingeschaltet und im Netzwerk?';
  return String(err?.message || '') || 'Unbekannter Fehler';
}

/** Talks to one Bambu Lab printer (MQTT state, camera, commands, recorded temperatures). */
export class BambuSource {
  /**
   * @param {ReturnType<typeof sanitizeBambu>} cfg
   * @param {{createSocket?: () => import('node:net').Socket, camera?: (onFrame, onEnd) => {close(): void}}} [opts]
   *   test hooks: socket for MQTT, producer for the camera
   */
  constructor(cfg, opts = {}) {
    this.cfg = cfg;
    this.opts = opts;
    this.pollMs = 1000; // reading only copies the pushed state
    this.offlineMs = 3000;
    this.report = null;
    this.modules = null;
    this.connected = false;
    this.error = null;
    this.lastMsgAt = 0;
    this.cancelled = false;
    this.run = null; // { start, printTime } of the current / last print
    this.history = [];
    this.waiters = new Set();
    this.seq = 0;
    this.delay = 0;
    this.closed = false;
    this.camera = null;
    this.cameraKey = null;
    this.connect();
    this.watchdog = setInterval(() => this.checkQuiet(), 15000);
    this.watchdog.unref?.();
  }

  get topic() {
    return `device/${this.cfg.serial}`;
  }

  connect() {
    if (this.closed) return;
    const client = new MqttClient({
      host: this.cfg.host,
      port: MQTT_PORT,
      username: 'bblp',
      password: this.cfg.accessCode,
      createSocket: this.opts.createSocket,
    });
    this.client = client;
    client.on('message', (topic, payload) => this.onMessage(topic, payload));
    client.on('close', (err) => {
      if (this.client !== client) return;
      this.connected = false;
      this.error = err ?? Object.assign(new Error('Verbindung vom Drucker getrennt'), { code: 'ECONNRESET' });
      this.settle(this.error);
      if (this.closed) return;
      // a wrong access code will not heal by itself: retry slowly
      this.delay = err?.code === 'MQTT_CONNACK' ? MAX_RETRY_MS : Math.min(MAX_RETRY_MS, this.delay ? this.delay * 2 : 2000);
      this.retry = setTimeout(() => this.connect(), this.delay);
      this.retry.unref?.();
    });
    client.connect().then(
      () => {
        if (this.client !== client) return;
        this.connected = true;
        this.error = null;
        this.delay = 0;
        this.lastMsgAt = Date.now();
        client.subscribe(`${this.topic}/report`);
        this.send({ info: { command: 'get_version' } });
        this.send({ pushing: { command: 'pushall' } });
      },
      () => {
        /* handled by the close event */
      },
    );
  }

  /** Publishes a request with a fresh sequence id. */
  send(msg) {
    const [key] = Object.keys(msg);
    const body = { [key]: { sequence_id: String(++this.seq), ...msg[key] } };
    this.client.publish(`${this.topic}/request`, JSON.stringify(body));
  }

  onMessage(topic, payload) {
    if (topic !== `${this.topic}/report`) return;
    let msg;
    try {
      msg = JSON.parse(payload.toString('utf8'));
    } catch {
      return;
    }
    this.lastMsgAt = Date.now();
    if (isObj(msg.print)) this.applyPrint(msg.print);
    if (msg.info?.command === 'get_version' && Array.isArray(msg.info.module)) this.modules = msg.info.module;
  }

  applyPrint(p) {
    const before = String(this.report?.gcode_state || '').toUpperCase();
    this.report = mergeReport(this.report, p);
    const now = String(this.report.gcode_state || '').toUpperCase();
    const idle = (s) => ['', 'IDLE', 'FINISH', 'FAILED'].includes(s);
    if (idle(before) && !idle(now)) this.cancelled = false; // a new print
    if (Number(p.print_error) === CANCELLED_ERROR) this.cancelled = true;
    if (this.report) this.settle(null);
  }

  /** Resolves (or rejects) everybody waiting for the first report. */
  settle(err) {
    for (const w of this.waiters) w(err);
    this.waiters.clear();
  }

  /** No message for a while: ask for the full state; still nothing: reconnect. */
  checkQuiet(now = Date.now()) {
    if (!this.connected) return;
    const quiet = now - this.lastMsgAt;
    if (quiet > QUIET_RECONNECT_MS) this.client.end();
    else if (quiet > QUIET_PUSHALL_MS) this.send({ pushing: { command: 'pushall' } });
  }

  waitForReport(ms = FIRST_REPORT_MS) {
    if (this.report && this.connected) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const w = (err) => {
        clearTimeout(timer);
        this.waiters.delete(w);
        if (err) reject(err);
        else resolve();
      };
      const timer = setTimeout(
        () => w(this.connected ? Object.assign(new Error('Keine Daten'), { code: 'NO_REPORT' }) : this.error ?? Object.assign(new Error('Zeitüberschreitung beim Verbinden'), { code: 'ETIMEDOUT' })),
        ms,
      );
      timer.unref?.();
      this.waiters.add(w);
    });
  }

  get model() {
    return modelFromModules(this.modules);
  }

  /** Elapsed print time: from `gcode_start_time` while printing, kept after the end of the print. */
  printTime(now) {
    const p = this.report || {};
    const start = num(p.gcode_start_time);
    const st = bambuState(p.gcode_state, this.cancelled);
    if (start && start > 1e9 && (st === 'printing' || st === 'paused')) {
      this.run = { start, printTime: Math.max(0, Math.round(now / 1000 - start)) };
    }
    return this.run && (!start || this.run.start === start) ? this.run.printTime : null;
  }

  /** Current state (throws while the printer is not connected). */
  async read(now = Date.now()) {
    if (!this.connected && this.error) throw this.error;
    await this.waitForReport();
    const model = this.model;
    const camera = this.cfg.camera === 'url' && !this.cfg.streamUrl ? 'off' : cameraKind(this.cfg.camera, this.report, model);
    const status = normalizeBambu(this.report, {
      model,
      firmware: firmwareOf(this.modules),
      cancelled: this.cancelled,
      printTime: this.printTime(now),
      camera,
      serial: this.cfg.serial,
    });
    this.record(status.temps, now);
    return {
      ...status,
      meta: {
        version: status.bambu.firmware ? `Firmware ${status.bambu.firmware}` : null,
        user: null,
        name: status.bambu.model ? `Bambu Lab ${status.bambu.model}` : '',
        webcam: { enabled: camera !== 'off' && camera !== 'disabled', streamUrl: '', snapshotUrl: '', flipH: false, flipV: false, rotate90: false, ratio: '16:9' },
      },
    };
  }

  /** Remembers the temperatures every 10 seconds for the last 30 minutes. */
  record(temps, now) {
    const last = this.history.at(-1);
    if (last && now - last.t < TEMP_STEP_MS) return;
    this.history.push({ t: now, temps });
    while (this.history.length && this.history[0].t < now - TEMP_KEEP_MS) this.history.shift();
  }

  /** Temperature curves of the last ~30 minutes (same shape as OctoPrint's). */
  async temps() {
    const out = {};
    for (const { t, temps } of this.history) {
      for (const s of temps) {
        if (s.actual === null) continue;
        const e = (out[s.key] ??= { label: s.label, actual: [], target: [] });
        e.actual.push([t, s.actual]);
        if (s.target !== null) e.target.push([t, s.target]);
      }
    }
    return out;
  }

  /** The camera for the current setting (created on first use, replaced when the kind changes). */
  cam() {
    const kind = this.cfg.camera === 'url' ? 'url' : cameraKind(this.cfg.camera, this.report, this.model);
    if (kind === 'off') throw new Error('Kamera ist ausgeschaltet');
    if (kind === 'disabled') throw new Error('LAN-Liveview ist am Drucker ausgeschaltet (Einstellungen → Allgemein → LAN-Liveview)');
    if (kind === 'url' && !this.cfg.streamUrl) throw new Error('Keine Kamera-Adresse eingetragen');
    if (this.camera && this.cameraKey === kind) return this.camera;
    this.camera?.close();
    const { host, accessCode } = this.cfg;
    const producer = this.opts.camera
      ?? (kind === 'rtsp'
        ? rtspProducer({ url: `rtsps://bblp:${encodeURIComponent(accessCode)}@${host}:${RTSP_PORT}/streaming/live/1` })
        : kind === 'url'
          ? urlProducer({ url: this.cfg.streamUrl })
          : jpegProducer({ host, accessCode }));
    this.camera = new FrameCamera(producer);
    this.cameraKey = kind;
    return this.camera;
  }

  async snapshot() {
    const f = await this.cam().frame();
    return { body: f.body, type: f.type };
  }

  async openStream() {
    return this.cam().openStream();
  }

  /**
   * Control: `pause`, `resume`, `stop`, `light` ({ on }) or `speed` ({ level: 1 … 4 }). The state
   * is updated right away (the printer confirms it with its next report).
   */
  async command(action, params = {}) {
    if (!this.connected) throw new Error('Drucker nicht verbunden');
    const st = bambuState(this.report?.gcode_state, this.cancelled);
    const busy = st === 'printing' || st === 'paused';
    if (action === 'pause' || action === 'resume' || action === 'stop') {
      if (!busy) throw new Error('Es läuft kein Druck');
      this.send({ print: { command: action, param: '' } });
      if (action === 'stop') this.cancelled = true;
    } else if (action === 'light') {
      const on = Boolean(params.on);
      const nodes = LIGHT2_MODELS.has(this.model) ? ['chamber_light', 'chamber_light2'] : ['chamber_light'];
      for (const node of nodes) this.send({ system: { command: 'ledctrl', led_node: node, led_mode: on ? 'on' : 'off', led_on_time: 500, led_off_time: 500, loop_times: 0, interval_time: 0 } });
      const lights = (this.report?.lights_report || []).filter((l) => !nodes.includes(l?.node));
      this.report = { ...this.report, lights_report: [...lights, ...nodes.map((node) => ({ node, mode: on ? 'on' : 'off' }))] };
    } else if (action === 'speed') {
      const level = Number(params.level);
      if (!SPEED_LEVELS[level]) throw new Error('Ungültige Geschwindigkeitsstufe');
      if (!busy) throw new Error('Die Geschwindigkeit lässt sich nur während eines Drucks ändern');
      this.send({ print: { command: 'print_speed', param: String(level) } });
      this.report = { ...this.report, spd_lvl: level };
    } else throw new Error('Unbekannter Befehl');
  }

  describe(err) {
    return bambuMessage(err);
  }

  /** Settings that need no new connection (camera, controls). */
  reconfigure(cfg) {
    const camera = cfg.camera !== this.cfg.camera || cfg.streamUrl !== this.cfg.streamUrl;
    this.cfg = cfg;
    if (camera) {
      this.camera?.close();
      this.camera = null;
      this.cameraKey = null;
    }
  }

  close() {
    this.closed = true;
    clearInterval(this.watchdog);
    clearTimeout(this.retry);
    this.settle(Object.assign(new Error('Verbindung beendet'), { code: 'ECONNRESET' }));
    this.client?.end();
    this.camera?.close();
  }
}

/* ------------------------------------------------------------------ demo */

/**
 * State of the simulated Bambu Lab printer (P1S with one AMS) in the demo mode, built as a report
 * and normalised like a real one. `settings` holds the light and speed level set by commands.
 */
export function demoBambu({ printing, done, total, temps, settings, name }) {
  const layers = 250;
  const completion = Math.round((done / total) * 100);
  const stage = !printing ? 0 : done < 60 ? 2 : done < 90 ? 7 : done < 150 ? 1 : 0;
  const report = {
    gcode_state: printing ? 'RUNNING' : 'FINISH',
    subtask_name: 'Benchy_PLA_0.2mm',
    gcode_file: '/data/Metadata/plate_1.gcode',
    print_type: 'local',
    mc_percent: completion,
    mc_remaining_time: Math.round((total - done) / 60),
    layer_num: Math.round((layers * done) / total),
    total_layer_num: layers,
    stg_cur: stage,
    nozzle_temper: temps.tool0[0],
    nozzle_target_temper: temps.tool0[1],
    bed_temper: temps.bed[0],
    bed_target_temper: temps.bed[1],
    cooling_fan_speed: printing && stage === 0 ? '15' : '0',
    big_fan1_speed: printing ? '10' : '0',
    big_fan2_speed: printing ? '6' : '0',
    heatbreak_fan_speed: printing ? '15' : '0',
    spd_lvl: settings.speed,
    spd_mag: { 1: 50, 2: 100, 3: 124, 4: 166 }[settings.speed],
    lights_report: [{ node: 'chamber_light', mode: settings.light ? 'on' : 'off' }],
    wifi_signal: '-52dBm',
    nozzle_diameter: '0.4',
    nozzle_type: 'stainless_steel',
    sdcard: true,
    ipcam: { timelapse: 'disable' },
    hms: [],
    ams: {
      tray_now: printing ? '1' : '255',
      ams: [
        {
          id: '0',
          humidity: '4',
          humidity_raw: '23',
          temp: '26.4',
          tray: [
            { id: '0', tray_type: 'PLA', tray_sub_brands: 'PLA Basic', tray_color: 'FFFFFFFF', remain: 82 },
            { id: '1', tray_type: 'PLA', tray_sub_brands: 'PLA Matte', tray_color: 'F98C36FF', remain: Math.round(64 - completion / 10) },
            { id: '2', tray_type: 'PETG', tray_sub_brands: 'PETG HF', tray_color: '164B35FF', remain: 35 },
            { id: '3' },
          ],
        },
      ],
    },
  };
  const status = normalizeBambu(report, { model: 'P1S', firmware: '01.08.00.00', printTime: Math.round(done), camera: 'jpeg', serial: '01P00A000000000' });
  return {
    ...status,
    meta: { version: 'Firmware 01.08.00.00 (Demo)', user: null, name, webcam: { enabled: true, streamUrl: '', snapshotUrl: '', flipH: false, flipV: false, rotate90: false, ratio: '16:9' } },
  };
}
