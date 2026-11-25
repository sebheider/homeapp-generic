/**
 * Data and geometry of the radar page. The LD2410 measures how far away a target is, but not in which
 * direction: a target is drawn as an arc across the radar's field of view (±60°), the energy of each
 * distance gate (engineering mode) as a ring band.
 */
import type { RadarFrame, StateEntry } from './types';

/** Half the opening angle of the LD2410 in degrees. */
export const FOV = 60;
/** Distance gates of the LD2410 (0 … 8). */
const GATES = 9;

/** Agents whose presence radar reported (datapoints `homeapp.kiosk.<id>.presence` or `.distance`), sorted. */
export function radarAgentIds(states: Record<string, StateEntry | undefined>): string[] {
  const ids = new Set<string>();
  for (const key of Object.keys(states)) {
    if (!key.startsWith('homeapp.kiosk.')) continue;
    const m = /^homeapp\.kiosk\.([^.]+)\.(?:presence|distance)$/.exec(key);
    if (m) ids.add(m[1]);
  }
  return [...ids].sort();
}

/** Values of an agent's regular reports (datapoints `homeapp.kiosk.<id>.…`). */
export interface RadarReport {
  presence?: unknown;
  moving?: unknown;
  still?: unknown;
  distance?: unknown;
}

/**
 * Picture from the regular reports (every few seconds, older agents or before the first live frame): one
 * distance for both kinds of target and no energies; with the OUT pin only the presence.
 */
export function reportFrame(r: RadarReport): RadarFrame {
  const presence = typeof r.presence === 'boolean' ? r.presence : null;
  const distance = typeof r.distance === 'number' ? r.distance : null;
  const target = (on: unknown) => (presence && on === true && distance !== null ? { distance, energy: null } : null);
  return {
    mode: distance === null && presence !== null ? 'pin' : 'report',
    presence,
    moving: target(r.moving),
    still: target(r.still),
    gates: null,
    gateCm: 75,
    error: null,
  };
}

/** Distance of the range rings in cm. */
export const ringStep = (range: number) => (range <= 300 ? 50 : 100);

/** Shown range in cm: all distance gates, the presence limit and every target, rounded up to the next ring. */
export function radarRange(frame: RadarFrame, limit = 0): number {
  const gates = frame.gates ? Math.max(frame.gates.moving.length, frame.gates.still.length) : GATES;
  const far = Math.max(gates * frame.gateCm, limit, frame.moving?.distance ?? 0, frame.still?.distance ?? 0, 1);
  const step = ringStep(far);
  return Math.ceil(far / step) * step;
}

/** Point at `r` (0…1 of the radius `R`) and `deg` degrees off the centre line (negative = left); the sensor sits at (cx, cy) and looks up. */
export function polar(cx: number, cy: number, R: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [cx + R * r * Math.sin(a), cy - R * r * Math.cos(a)];
}

const n = (v: number) => Math.round(v * 100) / 100;

/** SVG path of the arc at `r` (0…1) from `from` to `to` degrees. */
export function arcPath(cx: number, cy: number, R: number, r: number, from = -FOV, to = FOV): string {
  const [x1, y1] = polar(cx, cy, R, r, from);
  const [x2, y2] = polar(cx, cy, R, r, to);
  return `M${n(x1)} ${n(y1)}A${n(R * r)} ${n(R * r)} 0 ${to - from > 180 ? 1 : 0} 1 ${n(x2)} ${n(y2)}`;
}

/** SVG path of the ring band between `r0` and `r1` (0…1) across the field of view; `r0` = 0 gives the whole wedge. */
export function sectorPath(cx: number, cy: number, R: number, r0: number, r1: number, from = -FOV, to = FOV): string {
  const outer = arcPath(cx, cy, R, r1, from, to);
  if (r0 <= 0) return `${outer}L${n(cx)} ${n(cy)}Z`;
  const [x3, y3] = polar(cx, cy, R, r0, to);
  const [x4, y4] = polar(cx, cy, R, r0, from);
  return `${outer}L${n(x3)} ${n(y3)}A${n(R * r0)} ${n(R * r0)} 0 ${to - from > 180 ? 1 : 0} 0 ${n(x4)} ${n(y4)}Z`;
}

const formats = new Map<string, Intl.NumberFormat>();
const format = (min: number, max: number) => {
  const key = `${min}-${max}`;
  if (!formats.has(key)) formats.set(key, new Intl.NumberFormat('de-DE', { minimumFractionDigits: min, maximumFractionDigits: max }));
  return formats.get(key)!;
};
/** Distance for labels, e.g. "1,35 m" (`digits` decimals). */
export const meters = (cm: number, digits = 2) => `${format(digits, digits).format(cm / 100)} m`;
/** Short distance without unit and needless zeros, e.g. "0,75", "1,5", "3". */
export const metersShort = (cm: number) => format(0, 2).format(cm / 100);

/** Target distances of the last frames for the afterglow. */
export interface TrailPoint {
  at: number;
  moving: number | null;
  still: number | null;
}

/** Adds a frame received at `at` to the afterglow and drops points older than `keepMs`. */
export function addTrail(trail: TrailPoint[], at: number, frame: RadarFrame, keepMs = 2500): TrailPoint[] {
  return [...trail.filter((p) => p.at < at && at - p.at < keepMs), { at, moving: frame.moving?.distance ?? null, still: frame.still?.distance ?? null }];
}
