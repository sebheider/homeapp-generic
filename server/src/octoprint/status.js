/**
 * Printer state from OctoPrint's answers: state, job, progress and temperatures (also used to decide how a
 * print ended).
 */
import { finiteOrNull, round1 } from '../util/number.js';
import { trimText } from '../util/text.js';

/** States in which a print job runs – the printer counts as "active". */
export const ACTIVE_STATES = new Set(['printing', 'pausing', 'paused', 'cancelling', 'finishing']);

/** Most points of a temperature curve sent to the browser. */
const TEMP_POINTS = 300;

/**
 * Normalised printer state from OctoPrint's state text (`/api/job`) and – if the printer is connected –
 * its state flags (`/api/printer`): offline, connecting, idle, printing, pausing, paused, cancelling,
 * finishing, error or unknown.
 */
export function printerState(stateText, flags) {
  if (flags && typeof flags === 'object') {
    if (flags.cancelling) return 'cancelling';
    if (flags.pausing) return 'pausing';
    if (flags.paused) return 'paused';
    if (flags.finishing) return 'finishing';
    if (flags.printing || flags.resuming) return 'printing';
    if (flags.error) return 'error';
    if (flags.operational || flags.ready) return 'idle';
  }
  const t = String(stateText || '').toLowerCase();
  if (!t) return 'unknown';
  if (t.includes('cancel')) return 'cancelling';
  if (t.includes('pausing')) return 'pausing';
  if (t.includes('paused')) return 'paused';
  if (t.includes('finishing')) return 'finishing';
  if (t.includes('error')) return 'error';
  if (/offline|closed/.test(t)) return 'offline';
  // uploads to the SD card keep the printer busy but are no print job
  if (/sending|transferring/.test(t)) return 'idle';
  if (/printing|starting|resuming/.test(t)) return 'printing';
  if (/connect|detect|opening/.test(t)) return 'connecting';
  if (/operational|ready/.test(t)) return 'idle';
  return 'unknown';
}

/** Hotends (tool0 … n), bed and chamber with actual and target temperature; other sensors are left out. */
export function readTemps(temperature) {
  if (!temperature || typeof temperature !== 'object') return [];
  const tools = Object.keys(temperature).filter((k) => /^tool\d+$/.test(k)).sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)));
  const out = [];
  const add = (key, label) => {
    const e = temperature[key];
    const actual = finiteOrNull(e?.actual);
    if (actual !== null) out.push({ key, label, actual: round1(actual), target: round1(finiteOrNull(e.target)) });
  };
  tools.forEach((k, i) => add(k, tools.length > 1 ? `Düse ${i + 1}` : 'Düse'));
  add('bed', 'Bett');
  add('chamber', 'Kammer');
  return out;
}

/**
 * Temperature curves from OctoPrint's history (`time` in Unix seconds), at most {@link TEMP_POINTS}
 * points each: `{ tool0: { label, actual: [[ms, °C], …], target: [[ms, °C], …] }, bed: … }`.
 */
export function tempHistory(history) {
  const list = Array.isArray(history) ? history.filter((e) => e && Number.isFinite(Number(e.time))) : [];
  const out = {};
  if (!list.length) return out;
  const sensors = readTemps(list.at(-1));
  const step = Math.max(1, Math.ceil(list.length / TEMP_POINTS));
  // start so that the newest entry is always included
  for (let i = (list.length - 1) % step; i < list.length; i += step) {
    const e = list[i];
    const t = Number(e.time) * 1000;
    for (const { key, label } of sensors) {
      const actual = finiteOrNull(e[key]?.actual);
      if (actual === null) continue;
      const s = (out[key] ??= { label, actual: [], target: [] });
      s.actual.push([t, round1(actual)]);
      const target = finiteOrNull(e[key]?.target);
      if (target !== null) s.target.push([t, round1(target)]);
    }
  }
  return out;
}

/** Printer state, job and progress from the answers of `/api/job` and `/api/printer` (null while not connected). */
export function normalizeStatus({ job, printer } = {}) {
  const flags = printer?.state?.flags ?? null;
  const stateText = trimText(job?.state || printer?.state?.text, 120);
  const state = printerState(stateText, flags);
  const file = job?.job?.file;
  const prog = job?.progress && typeof job.progress === 'object' ? job.progress : null;
  let filament = null;
  const fil = job?.job?.filament;
  if (fil && typeof fil === 'object') {
    const total = Object.values(fil).reduce((sum, f) => sum + (finiteOrNull(f?.length) ?? 0), 0);
    filament = total > 0 ? Math.round(total) : null;
  }
  const completion = finiteOrNull(prog?.completion);
  return {
    state,
    stateText,
    printerError: trimText(printer?.state?.error || job?.error, 300) || null,
    job: file?.name
      ? {
          file: trimText(file.display || file.name, 200),
          path: trimText(file.path || file.name, 300),
          origin: file.origin === 'sdcard' ? 'sdcard' : 'local',
          size: finiteOrNull(file.size),
          user: job.job.user ? trimText(job.job.user, 80) : null,
          estimatedPrintTime: finiteOrNull(job.job.estimatedPrintTime),
          filament,
        }
      : null,
    progress: prog
      ? {
          completion: completion === null ? null : Math.min(100, Math.max(0, completion)),
          printTime: finiteOrNull(prog.printTime),
          printTimeLeft: finiteOrNull(prog.printTimeLeft),
          printTimeLeftOrigin: prog.printTimeLeftOrigin ? trimText(prog.printTimeLeftOrigin, 40) : null,
        }
      : null,
    temps: readTemps(printer?.temperature),
  };
}

/** How a print ended: `done`, `cancelled` or `error` (from the last active state and the first one after it). */
export function finishReason(lastState, lastCompletion, now) {
  if (now?.state === 'error') return 'error';
  if (lastState === 'cancelling') return 'cancelled';
  const completion = now?.progress?.completion ?? lastCompletion ?? 0;
  if (lastState === 'finishing' || completion >= 99.5) return 'done';
  if (now?.state === 'offline') return 'error';
  return 'cancelled';
}
