/**
 * 3D printer (OctoPrint or Bambu Lab): state labels and colours, time / ETA formatting, the webcam
 * orientation, Bambu details (HMS messages, WiFi, AMS) and the rules of the webcam pop-up (incl.
 * "hide until this print ends", stored per browser).
 */
import type { BambuDetails, PrinterData, PrinterPopupEvent, PrinterPopupReason, PrinterStateKey } from './types';

/** German label and accent colour per printer state. */
export const PRINTER_STATE: Record<PrinterStateKey, { label: string; color: string }> = {
  offline: { label: 'Getrennt', color: '#94a3b8' },
  connecting: { label: 'Verbindet …', color: '#38bdf8' },
  idle: { label: 'Bereit', color: '#34d399' },
  printing: { label: 'Druckt', color: '#22d3ee' },
  pausing: { label: 'Pausiert …', color: '#fbbf24' },
  paused: { label: 'Pausiert', color: '#fbbf24' },
  cancelling: { label: 'Bricht ab …', color: '#fb923c' },
  finishing: { label: 'Schließt ab …', color: '#34d399' },
  error: { label: 'Fehler', color: '#f43f5e' },
  unknown: { label: 'Unbekannt', color: '#94a3b8' },
};

/** Label and colour of the printer as a whole: an unreachable printer / OctoPrint wins over the printer state. */
export function printerStatus(p: Pick<PrinterData, 'connected' | 'error' | 'state'> | null | undefined) {
  if (!p) return { label: 'Nicht eingerichtet', color: PRINTER_STATE.offline.color };
  if (!p.connected) return p.error ? { label: 'Nicht erreichbar', color: PRINTER_STATE.error.color } : PRINTER_STATE.connecting;
  return PRINTER_STATE[p.state] ?? PRINTER_STATE.unknown;
}

/** Title of the pop-up per reason. */
export const POPUP_TITLE: Record<PrinterPopupReason, string> = {
  interval: '3D-Druck läuft',
  done: '3D-Druck fertig',
  cancelled: '3D-Druck abgebrochen',
  error: '3D-Druck mit Fehler beendet',
  preview: 'Vorschau: 3D-Drucker',
};

/** Duration in seconds as "2 h 05 min", "45 min" or "< 1 min"; '–' if unknown. */
export function duration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '–';
  const min = Math.round(seconds / 60);
  if (min < 1) return '< 1 min';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}

const clock = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
const weekday = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });

/** Expected end of the print: "18:42", "morgen 06:10" or "Mo. 09:00"; null if unknown. */
export function finishTime(secondsLeft: number | null | undefined, now = Date.now()): string | null {
  if (secondsLeft == null || !Number.isFinite(secondsLeft) || secondsLeft < 0) return null;
  const end = new Date(now + secondsLeft * 1000);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const days = Math.floor((end.getTime() - start.getTime()) / 86400000);
  const time = clock.format(end);
  if (days <= 0) return time;
  if (days === 1) return `morgen ${time}`;
  return `${weekday.format(end)} ${time}`;
}

/** Progress in whole percent (0 … 100), null if unknown. */
export const percent = (p: Pick<PrinterData, 'progress'> | null | undefined) =>
  p?.progress?.completion == null ? null : Math.min(100, Math.max(0, Math.floor(p.progress.completion)));

/** File name without the G-code or project extension (`.gcode`, `.bgcode`, `.3mf`, `.gcode.3mf` …). */
export const fileLabel = (name: string | null | undefined) =>
  String(name ?? '').replace(/(\.gcode)?\.3mf$/i, '').replace(/\.(gcode|gco|g|bgcode)$/i, '');

/** Name of the connection kind for texts ("OctoPrint nicht erreichbar" / "Drucker nicht erreichbar"). */
export const sourceName = (p: Pick<PrinterData, 'kind'> | null | undefined) => (p?.kind === 'bambu' ? 'Drucker' : 'OctoPrint');

/** German label and colour of a Bambu HMS message by severity. */
export const HMS_SEVERITY: Record<BambuDetails['hms'][number]['severity'], { label: string; color: string }> = {
  fatal: { label: 'Schwerer Fehler', color: '#f43f5e' },
  serious: { label: 'Fehler', color: '#fb923c' },
  common: { label: 'Hinweis', color: '#fbbf24' },
  info: { label: 'Info', color: '#38bdf8' },
  unknown: { label: 'Meldung', color: '#94a3b8' },
};

/** Bambu wiki page that explains the HMS codes (the code can be searched there). */
export const HMS_WIKI_URL = 'https://wiki.bambulab.com/en/hms/home';

/**
 * Layer and current step of a Bambu Lab print for the overview: "Schicht 63 / 150 · Düse aufheizen".
 * A step that only repeats the state ("Druckt") is left out.
 */
export function bambuJobLine(p: Pick<PrinterData, 'active' | 'bambu' | 'stateText'> | null | undefined): string | null {
  const b = p?.bambu;
  if (!b || !p?.active) return null;
  const stage = b.stage && b.stage !== p.stateText ? b.stage : null;
  const parts = [b.layer && b.layer.total > 0 ? `Schicht ${b.layer.current} / ${b.layer.total}` : null, stage];
  return parts.filter(Boolean).join(' · ') || null;
}

/** WiFi signal (dBm) as text with a rough quality: "-53 dBm (gut)". */
export function wifiText(dbm: number | null | undefined): string | null {
  if (dbm == null || !Number.isFinite(dbm)) return null;
  const q = dbm >= -55 ? 'sehr gut' : dbm >= -67 ? 'gut' : dbm >= -75 ? 'mäßig' : 'schwach';
  return `${dbm} dBm (${q})`;
}

/** Humidity of an AMS: percent if known, otherwise the level 1 (wet) … 5 (dry) of older firmware. */
export function amsHumidity(unit: Pick<BambuDetails['ams']['units'][number], 'humidity' | 'humidityLevel'>): string | null {
  if (unit.humidity != null) return `${unit.humidity} %`;
  if (unit.humidityLevel != null && unit.humidityLevel > 0) return `Stufe ${unit.humidityLevel} von 5`;
  return null;
}

/** Whether a colour is light, so text on it has to be dark. */
export function isLightColor(hex: string | null | undefined): boolean {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? '');
  if (!m) return false;
  const [r, g, b] = m.slice(1).map((v) => parseInt(v, 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 160;
}

/** Filament length (mm) as "3,8 m". */
export const filamentText = (mm: number | null | undefined) =>
  mm == null ? null : `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: mm >= 10000 ? 0 : 1 }).format(mm / 1000)} m`;

/** CSS transform that shows the webcam picture like OctoPrint does (mirrored / rotated by 90° anticlockwise). */
export function webcamTransform(w: Pick<PrinterData['webcam'], 'flipH' | 'flipV' | 'rotate90'> | null | undefined): string | undefined {
  if (!w) return undefined;
  const parts = [w.rotate90 ? 'rotate(-90deg)' : '', w.flipH ? 'scaleX(-1)' : '', w.flipV ? 'scaleY(-1)' : ''].filter(Boolean);
  return parts.length ? parts.join(' ') : undefined;
}

/** localStorage key: id of the print whose regular pop-ups this browser hides. */
export const PRINTER_POPUP_HIDDEN_KEY = 'printerPopupsHiddenJob';

export function loadHiddenPrinterJob(): string | null {
  try {
    const v = localStorage.getItem(PRINTER_POPUP_HIDDEN_KEY);
    return v && v.length <= 80 ? v : null;
  } catch {
    return null;
  }
}

export function saveHiddenPrinterJob(jobId: string | null) {
  try {
    if (jobId) localStorage.setItem(PRINTER_POPUP_HIDDEN_KEY, jobId);
    else localStorage.removeItem(PRINTER_POPUP_HIDDEN_KEY);
  } catch {
    /* hiding still works until the page is reloaded */
  }
}

/**
 * Whether a printer pop-up may appear in this browser: regular pop-ups of a print the user hid stay
 * away (the final one still appears), as do regular ones while the printer page with its webcam is
 * open; a running camera pop-up (security) is never covered.
 */
export function shouldShowPrinterPopup(
  event: Pick<PrinterPopupEvent, 'reason' | 'jobId'>,
  opts: { hiddenJob: string | null; cameraPopup: boolean; onPrinterPage?: boolean },
) {
  if (opts.cameraPopup) return false;
  if (event.reason !== 'interval') return true;
  if (opts.onPrinterPage) return false;
  return !(event.jobId != null && event.jobId === opts.hiddenJob);
}
