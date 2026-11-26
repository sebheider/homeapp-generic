/**
 * State of a Bambu Lab printer: partial reports are merged into the full state, which is normalised to the
 * shape of the OctoPrint source plus the Bambu details.
 */
import { isObj } from '../util/object.js';
import { trimText } from '../util/text.js';
import { readAms, readBambuTemps, readFans, readNozzles } from './hardware.js';
import { GCODE_STATE_TEXT, SPEED_LEVELS, STAGES } from './labels.js';
import { modelName } from './models.js';
import { num } from './values.js';

/** print_error of a print cancelled by the user (0300_400C). */
export const CANCELLED_ERROR = 0x0300400c;

const HMS_SEVERITY = { 1: 'fatal', 2: 'serious', 3: 'common', 4: 'info' };

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

/**
 * Printer state in the shape of the OctoPrint source plus the Bambu details (`bambu`) from the merged
 * report. `ctx`: `{ model, firmware, cancelled, printTime, camera, serial }`.
 */
export function normalizeBambu(p = {}, ctx = {}) {
  const gs = String(p.gcode_state || '').toUpperCase();
  const state = bambuState(gs, ctx.cancelled);
  const active = state === 'printing' || state === 'paused';
  const file = trimText(p.subtask_name, 200) || trimText(String(p.gcode_file || '').split('/').pop(), 200);
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
          path: trimText(p.gcode_file, 300) || file,
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
