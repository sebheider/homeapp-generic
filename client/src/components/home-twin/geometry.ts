/** Isometric geometry of the digital twin: storey dimensions, projection, room layout and callout placement. */
import { floorOf, type RoomSummary } from '../../lib/overview';

/** Footprint of a storey and room height (abstract units), pixels per unit, cos 30°. */
export const W = 12;
export const D = 9;
export const RH = 1.1;
export const S = 16;
export const K = Math.cos(Math.PI / 6);

export type V3 = [number, number, number];
export type Pt = [number, number];
/** Isometric projection of a point (x to the lower right, y to the lower left, z up). */
export const P = ([x, y, z]: V3): Pt => [(x - y) * K * S, (x + y) * 0.5 * S - z * S];
export const pts = (a: V3[]) => a.map((p) => P(p).map((v) => v.toFixed(1)).join(',')).join(' ');
export const rect = (x0: number, y0: number, x1: number, y1: number, z: number): V3[] => [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]];

export interface Tile {
  id: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  z: number;
}

export interface Callout {
  key: string;
  anchor: Pt;
  name: string;
  value: string;
  sub: string;
  color: string;
  prio: number;
  onClick?: () => void;
}

/** Positions of storeys and rooms; only depends on the room list and their storeys. */
export function layout(rooms: RoomSummary[], gap: number) {
  const floors = [...new Set(rooms.map((r) => floorOf(r.room)))].sort((a, b) => a - b);
  const tiles: Tile[] = [];
  floors.forEach((f, level) => {
    const list = rooms.filter((r) => floorOf(r.room) === f);
    const n = list.length;
    // rows so that the rooms stay roughly square on the 12 × 9 footprint
    const rows = Math.min(n, Math.max(1, Math.round(Math.sqrt((n * D) / W))));
    let k = 0;
    for (let row = 0; row < rows; row++) {
      const count = Math.floor(n / rows) + (row < n % rows ? 1 : 0);
      for (let c = 0; c < count; c++, k++) {
        tiles.push({ id: list[k].room.id, x0: (c * W) / count, x1: ((c + 1) * W) / count, y0: (row * D) / rows, y1: ((row + 1) * D) / rows, z: level * gap });
      }
    }
  });
  const top = Math.max(0, floors.length - 1) * gap;
  // the ground floor carries the heat pump and the battery (or the lowest storey without one)
  const ground = Math.max(0, floors.indexOf(0)) * gap;
  return { floors, gap, tiles, top, ground, roofBase: top + 4, ridge: top + 7 };
}

/** Deterministic pseudo random numbers (same particles on every render). */
export function random(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Spreads the callouts of one side vertically so they keep `gap` apart inside [top, bottom]. */
export function spread(list: Callout[], top: number, bottom: number, gap: number) {
  const sorted = [...list].sort((a, b) => a.anchor[1] - b.anchor[1]);
  const ys = sorted.map((c) => Math.min(bottom, Math.max(top, c.anchor[1])));
  for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + gap);
  if (ys.length && ys[ys.length - 1] > bottom) {
    ys[ys.length - 1] = bottom;
    for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - gap);
  }
  return sorted.map((c, i) => ({ c, y: ys[i] }));
}
