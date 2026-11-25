/**
 * Robotic mower (e.g. Segway Navimow through the ioBroker adapter "navimow"): state labels and colours,
 * the commands that fit a state, and the parsing and geometry of the live map (track, map frame,
 * charging station, position). Coordinates are metres in the mower's own system (not GPS), y points up.
 */

/** What the mower is doing, derived from the adapter's state text (see {@link mowerActivity}). */
export type MowerActivity =
  | 'mowing' | 'returning' | 'paused' | 'docked' | 'charging' | 'idle' | 'mapping'
  | 'lifted' | 'error' | 'update' | 'selftest' | 'offline' | 'unknown';

/** German label and accent colour per activity; `problem` marks states that need attention. */
export const MOWER_STATE: Record<MowerActivity, { label: string; color: string; problem?: boolean }> = {
  mowing: { label: 'Mäht', color: '#34d399' },
  returning: { label: 'Fährt zur Station', color: '#38bdf8' },
  paused: { label: 'Pausiert', color: '#fbbf24' },
  docked: { label: 'In der Ladestation', color: '#a78bfa' },
  charging: { label: 'Lädt', color: '#facc15' },
  idle: { label: 'Bereit', color: '#2dd4bf' },
  mapping: { label: 'Kartiert', color: '#22d3ee' },
  lifted: { label: 'Angehoben', color: '#f43f5e', problem: true },
  error: { label: 'Fehler', color: '#f43f5e', problem: true },
  update: { label: 'Software-Update', color: '#818cf8' },
  selftest: { label: 'Selbsttest', color: '#38bdf8' },
  offline: { label: 'Offline', color: '#94a3b8', problem: true },
  unknown: { label: 'Unbekannt', color: '#94a3b8' },
};

/**
 * State texts of the navimow adapter (`status.vehicleState`: isRunning, isDocked, ...), of its
 * `status.state` (mowing, docked, ...) and a few common spellings, lower case.
 */
const ACTIVITY_ALIASES: Record<string, MowerActivity> = {
  isrunning: 'mowing', mowing: 'mowing', running: 'mowing', working: 'mowing',
  isdocking: 'returning', returning: 'returning', docking: 'returning',
  ispaused: 'paused', paused: 'paused',
  isdocked: 'docked', docked: 'docked',
  ischarging: 'charging', charging: 'charging',
  isidle: 'idle', isidel: 'idle', idle: 'idle',
  ismapping: 'mapping', mapping: 'mapping',
  islifted: 'lifted', lifted: 'lifted',
  error: 'error', iserror: 'error', fault: 'error',
  insoftwareupdate: 'update', softwareupdate: 'update', updating: 'update',
  'self-checking': 'selftest', selfchecking: 'selftest',
  offline: 'offline', isoffline: 'offline',
};

/** Activity of a state value (unknown texts become 'unknown'). */
export const mowerActivity = (v: unknown): MowerActivity => ACTIVITY_ALIASES[String(v ?? '').trim().toLowerCase()] ?? 'unknown';

/** Label and colour of a state value; an unknown text is shown as it is. */
export function mowerStatus(v: unknown) {
  const activity = mowerActivity(v);
  const raw = String(v ?? '').trim();
  const s = MOWER_STATE[activity];
  return { activity, ...s, label: activity === 'unknown' && raw ? raw : s.label };
}

/** The mower drives (its position changes and the track grows). */
export const isDriving = (a: MowerActivity) => a === 'mowing' || a === 'returning' || a === 'mapping';
/** The mower stands in its charging station. */
export const isDocked = (a: MowerActivity) => a === 'docked' || a === 'charging';

/** Buttons of the mower (datapoint keys of the device). */
export type MowerCommand = 'start' | 'pause' | 'resume' | 'home';
export type MowerMaintenance = 'refresh' | 'resetMap' | 'station';

/** Labels of the commands, in the order of the control panel. */
export const MOWER_COMMANDS: { key: MowerCommand; label: string }[] = [
  { key: 'start', label: 'Start' },
  { key: 'pause', label: 'Pause' },
  { key: 'resume', label: 'Fortsetzen' },
  { key: 'home', label: 'Zur Station' },
];

export const MAINTENANCE_LABELS: Record<MowerMaintenance, string> = {
  refresh: 'Status abrufen',
  resetMap: 'Karte zurücksetzen',
  station: 'Ladestation neu bestimmen',
};

/**
 * Commands that fit the activity (highlighted). The others stay available: the cloud reports the
 * state up to a minute late, so the shown state must never block a command.
 */
export function suggestedCommands(a: MowerActivity): MowerCommand[] {
  switch (a) {
    case 'mowing':
    case 'mapping':
      return ['pause', 'home'];
    case 'paused':
      return ['resume', 'home'];
    case 'returning':
      return ['pause'];
    case 'docked':
    case 'charging':
    case 'idle':
      return ['start'];
    default:
      return [];
  }
}

/* ------------------------------------------------------------------ map */

/** A position in mower coordinates (metres); `h` is the heading in radians (0 = +x, counter-clockwise). */
export interface MapPoint {
  x: number;
  y: number;
  h?: number;
}

/** Rectangle in mower coordinates. */
export interface MapBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** The mowing track of the current session (navimow `mapTrack`). */
export interface MowerTrack {
  points: MapPoint[];
  percentage: number | null;
  area: number | null;
}

const finite = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** JSON text or an already parsed value; null for anything that is not valid JSON. */
function json(v: unknown): unknown {
  if (typeof v !== 'string') return v ?? null;
  if (!v.trim()) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

/** A point from `[x, y, heading?]` or `{ x, y }` (null if invalid). */
function toPoint(p: unknown): MapPoint | null {
  const arr = Array.isArray(p) ? p : null;
  const obj = !arr && p && typeof p === 'object' ? (p as Record<string, unknown>) : null;
  const x = finite(arr ? arr[0] : obj?.x);
  const y = finite(arr ? arr[1] : obj?.y);
  if (x === null || y === null) return null;
  const h = finite(arr ? arr[2] : (obj?.h ?? obj?.theta));
  return h === null ? { x, y } : { x, y, h };
}

/** Track of `{ percentage, area, points: [[x, y, heading?], …] }` (or a bare list of points). */
export function parseTrack(v: unknown): MowerTrack | null {
  const t = json(v);
  const list = Array.isArray(t) ? t : t && typeof t === 'object' ? (t as Record<string, unknown>).points : null;
  if (!Array.isArray(list)) return null;
  const meta = t && typeof t === 'object' && !Array.isArray(t) ? (t as Record<string, unknown>) : {};
  return {
    points: list.map(toPoint).filter((p): p is MapPoint => p !== null),
    percentage: finite(meta.percentage),
    area: finite(meta.area),
  };
}

/** Map frame `{ minX, maxX, minY, maxY, … }` of the adapter (null if invalid or empty). */
export function parseFrame(v: unknown): MapBounds | null {
  const f = json(v) as Record<string, unknown> | null;
  if (!f || typeof f !== 'object') return null;
  const [minX, maxX, minY, maxY] = [f.minX, f.maxX, f.minY, f.maxY].map(finite);
  if (minX === null || maxX === null || minY === null || maxY === null || maxX <= minX || maxY <= minY) return null;
  return { minX, maxX, minY, maxY };
}

/** Charging station `{"x":…,"y":…}` (null while unknown). */
export const parsePoint = (v: unknown): MapPoint | null => toPoint(json(v));

/** Rotation of the map (clockwise, degrees) – lets the picture match the view onto the garden. */
export type MapRotation = 0 | 90 | 180 | 270;
export const mapRotation = (v: unknown): MapRotation => {
  const n = Number(v);
  return n === 90 || n === 180 || n === 270 ? n : 0;
};

/** Turns a point clockwise by `rot` degrees as seen on the map (y up); the heading turns along. */
export function rotatePoint(p: MapPoint, rot: MapRotation): MapPoint {
  const [x, y] = rot === 90 ? [p.y, -p.x] : rot === 180 ? [-p.x, -p.y] : rot === 270 ? [-p.y, p.x] : [p.x, p.y];
  return p.h === undefined ? { x, y } : { x, y, h: p.h - (rot * Math.PI) / 180 };
}

/** Corners of a rectangle turned by `rot`, as a rectangle again. */
export function rotateBounds(b: MapBounds, rot: MapRotation): MapBounds {
  const c = [
    { x: b.minX, y: b.minY }, { x: b.maxX, y: b.maxY },
  ].map((p) => rotatePoint(p, rot));
  return { minX: Math.min(c[0].x, c[1].x), maxX: Math.max(c[0].x, c[1].x), minY: Math.min(c[0].y, c[1].y), maxY: Math.max(c[0].y, c[1].y) };
}

/**
 * Area the map shows: the adapter's frame (if any), grown by everything that has to be visible (track,
 * live position, station) plus `pad` metres, at least `minSize` metres in both directions. Null if there
 * is nothing to show.
 */
export function mapBounds(frame: MapBounds | null, points: MapPoint[], pad = 0.6, minSize = 4): MapBounds | null {
  if (!frame && !points.length) return null;
  let b = frame ? { ...frame } : { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const p of points) {
    b = { minX: Math.min(b.minX, p.x - pad), maxX: Math.max(b.maxX, p.x + pad), minY: Math.min(b.minY, p.y - pad), maxY: Math.max(b.maxY, p.y + pad) };
  }
  const grow = (lo: number, hi: number) => {
    const missing = Math.max(0, minSize - (hi - lo)) / 2;
    return [lo - missing, hi + missing];
  };
  const [minX, maxX] = grow(b.minX, b.maxX);
  const [minY, maxY] = grow(b.minY, b.maxY);
  return { minX, maxX, minY, maxY };
}

/** Grid spacing in metres: 1, 2, 5, 10, 20 or 50 – about a dozen lines across the longer side. */
export function gridStep(span: number) {
  return [1, 2, 5, 10, 20, 50].find((s) => span / s <= 14) ?? 100;
}

/** Map units per metre and a projection of mower coordinates to SVG coordinates (y down). */
export function projection(b: MapBounds, size = 1000) {
  const scale = size / Math.max(b.maxX - b.minX, b.maxY - b.minY);
  return {
    scale,
    width: (b.maxX - b.minX) * scale,
    height: (b.maxY - b.minY) * scale,
    at: (p: MapPoint): [number, number] => [(p.x - b.minX) * scale, (b.maxY - p.y) * scale],
  };
}

/** SVG path through the points ("M x y L x y …"), one decimal. */
export function pathOf(points: MapPoint[], at: (p: MapPoint) => [number, number]) {
  return points.map((p, i) => {
    const [x, y] = at(p);
    return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join('');
}

/** Rotation of the mower symbol in degrees for SVG (y down, clockwise) from a heading in radians. */
export const headingDeg = (h: number) => (-h * 180) / Math.PI;

/**
 * Shortest turn to `target` degrees from `prev` (keeps the symbol from spinning the long way round
 * when the angle wraps from 179° to -179°).
 */
export const unwrapDeg = (prev: number, target: number) => prev + ((((target - prev) % 360) + 540) % 360) - 180;

/**
 * Positions received since the adapter last wrote its track: appended while the mower drives, so the
 * map follows it between two track updates. Returns the same array if nothing was added.
 */
export function appendTail(tail: MapPoint[], p: MapPoint, minDist = 0.05, max = 2000): MapPoint[] {
  const last = tail.at(-1);
  if (last && Math.hypot(p.x - last.x, p.y - last.y) < minDist) return tail;
  const next = [...tail, p];
  return next.length > max ? next.slice(next.length - max) : next;
}

/** Area in square metres: "75,9 m²" (whole metres from 100 m²); '–' if unknown. */
export function areaText(m2: number | null | undefined) {
  if (m2 == null || !Number.isFinite(m2)) return '–';
  return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: m2 >= 100 ? 0 : 1 }).format(m2)} m²`;
}
