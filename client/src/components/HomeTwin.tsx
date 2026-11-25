/**
 * Digital twin of the house for the "Nexus" overview: an isometric hologram generated from the
 * configured rooms (no floor plan needed). Every storey floats above the one below (exploded
 * view) and its rooms are laid out as a grid. Rooms glow in the colour of their temperature and
 * show lights, presence, heating, open windows and alerts; solar panels, heat pump and battery
 * appear when the installation has them. Callouts with the live values point at the rooms and are
 * placed so they never overlap; a changed value arrives as a data stream from its room. Everything is
 * one SVG that scales with its box.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useElementSize } from '../lib/hooks';
import { clamp, num } from '../lib/format';
import { useStore } from '../lib/store';
import { FLOORS, floorOf, type RoomSummary } from '../lib/overview';

/** Footprint of a storey and room height (abstract units), pixels per unit, cos 30°. */
const W = 12;
const D = 9;
const RH = 1.1;
const S = 16;
const K = Math.cos(Math.PI / 6);

export const NX = { cyan: '#22e4ff', amber: '#ffb020', red: '#ff4d6d', orange: '#ff8a3d', green: '#2dffa8', violet: '#8b5cf6', magenta: '#ff3fd8', muted: '#7d90b5' };

type V3 = [number, number, number];
type Pt = [number, number];
/** Isometric projection of a point (x to the lower right, y to the lower left, z up). */
const P = ([x, y, z]: V3): Pt => [(x - y) * K * S, (x + y) * 0.5 * S - z * S];
const pts = (a: V3[]) => a.map((p) => P(p).map((v) => v.toFixed(1)).join(',')).join(' ');
const rect = (x0: number, y0: number, x1: number, y1: number, z: number): V3[] => [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]];

/** Colour scale of room temperatures: cold blue … comfortable green … hot red. */
const STOPS: [number, number[]][] = [[17, [59, 130, 246]], [19.5, [34, 228, 255]], [21, [45, 255, 168]], [22.4, [255, 176, 32]], [24, [255, 77, 109]]];
export function tempColor(t: number | null) {
  if (t == null) return NX.cyan;
  if (t <= STOPS[0][0]) return `rgb(${STOPS[0][1]})`;
  for (let k = 1; k < STOPS.length; k++) {
    if (t > STOPS[k][0]) continue;
    const [t0, c0] = STOPS[k - 1];
    const [t1, c1] = STOPS[k];
    const f = (t - t0) / (t1 - t0);
    return `rgb(${c0.map((v, j) => Math.round(v + (c1[j] - v) * f))})`;
  }
  return `rgb(${STOPS[STOPS.length - 1][1]})`;
}

/** Something outside the rooms that gets a callout (solar roof, heat pump, battery). */
export interface TwinExtra {
  name: string;
  value: string;
  sub?: string;
  color: string;
  onClick?: () => void;
}

interface Tile {
  id: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  z: number;
}

interface Callout {
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
function layout(rooms: RoomSummary[], gap: number) {
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
function random(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Spreads the callouts of one side vertically so they keep `gap` apart inside [top, bottom]. */
function spread(list: Callout[], top: number, bottom: number, gap: number) {
  const sorted = [...list].sort((a, b) => a.anchor[1] - b.anchor[1]);
  const ys = sorted.map((c) => Math.min(bottom, Math.max(top, c.anchor[1])));
  for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + gap);
  if (ys.length && ys[ys.length - 1] > bottom) {
    ys[ys.length - 1] = bottom;
    for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - gap);
  }
  return sorted.map((c, i) => ({ c, y: ys[i] }));
}

/** Text of a room callout: humidity / CO₂ and what is going on. */
function roomSub(s: RoomSummary) {
  const parts: string[] = [];
  if (s.humidity != null) parts.push(`${num(s.humidity, 0)} %`);
  else if (s.co2 != null) parts.push(`CO₂ ${num(s.co2, 0)}`);
  if (s.open.length) parts.push(`${s.open[0].name} offen`);
  else if (s.heating) parts.push('heizt');
  if (s.presence) parts.push('Person');
  const on = s.lights.filter(Boolean).length;
  if (on && parts.length < 2) parts.push(`${on} Licht${on > 1 ? 'er' : ''} an`);
  const text = parts.join(' · ');
  return text.length > 28 ? `${text.slice(0, 27)}…` : text;
}

/** A glass box (used for heat pump and battery). */
function Box({ x0, y0, x1, y1, z0, z1, color, top = 0.22 }: { x0: number; y0: number; x1: number; y1: number; z0: number; z1: number; color: string; top?: number }) {
  return (
    <g>
      <polygon points={pts([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]])} fill={color} fillOpacity={0.15} stroke={color} strokeWidth={1} />
      <polygon points={pts([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]])} fill={color} fillOpacity={0.1} stroke={color} strokeWidth={1} />
      <polygon points={pts(rect(x0, y0, x1, y1, z1))} fill={color} fillOpacity={top} stroke={color} strokeWidth={1.3} filter="url(#nxGlow)" />
    </g>
  );
}

/** Room name lying on the floor of its tile (like printed on a holo table); skipped if it does not fit. */
function FloorText({ t, name }: { t: Tile; name: string }) {
  const width = t.x1 - t.x0;
  const label = name.toUpperCase();
  // ~0.36 units per character at this size
  const fit = (s: string) => s.length * 0.36 + 0.6 <= width && t.y1 - t.y0 >= 1.4;
  const text = fit(label) ? label : fit(label.split(/\s+/)[0]) ? label.split(/\s+/)[0] : null;
  if (!text) return null;
  const [x, y] = P([(t.x0 + t.x1) / 2, (t.y0 + t.y1) / 2, t.z]);
  return (
    <text className="nx-floortext" transform={`matrix(${K} 0.5 ${-K} 0.5 ${x.toFixed(1)} ${y.toFixed(1)})`} textAnchor="middle" dominantBaseline="central">
      {text}
    </text>
  );
}

/** One room: floor, glass walls, glowing outline and what happens inside. */
function RoomTile({ t, s, alert, onClick }: { t: Tile; s: RoomSummary; alert?: string; onClick: () => void }) {
  const { x0, y0, x1, y1, z } = t;
  const z1 = z + RH;
  const warn = alert ?? (s.open.length ? NX.amber : undefined);
  const c = warn ?? tempColor(s.temp);
  const mid: V3 = [(x0 + x1) / 2, (y0 + y1) / 2, z];
  const [cx, cy] = P(mid);
  const size = Math.min(x1 - x0 + y1 - y0, 12);
  const lightsOn = s.lights.some(Boolean);
  const [bx, by] = P([mid[0], mid[1], z1 + 0.7]);
  const [px, py] = P([x0 + (x1 - x0) * 0.3, y0 + (y1 - y0) * 0.55, z]);
  const [wx, wy] = P([mid[0], mid[1], z1 + 1.5]);
  return (
    <g className="nx-room" onClick={onClick} role="button" aria-label={s.room.name}>
      <polygon points={pts(rect(x0, y0, x1, y1, z))} fill={c} fillOpacity={0.2} />
      {s.heating && <ellipse cx={cx} cy={cy} rx={size * 3.6} ry={size * 1.8} fill="url(#nxHeat)" />}
      {lightsOn && <ellipse cx={cx} cy={cy} rx={size * 4.8} ry={size * 2.5} fill="url(#nxWarm)" className="nx-lamp" />}
      <FloorText t={t} name={s.room.name} />
      <polygon points={pts([[x0, y0, z], [x1, y0, z], [x1, y0, z1], [x0, y0, z1]])} fill={c} fillOpacity={0.05} stroke={c} strokeOpacity={0.3} strokeWidth={0.8} />
      <polygon points={pts([[x0, y0, z], [x0, y1, z], [x0, y1, z1], [x0, y0, z1]])} fill={c} fillOpacity={0.05} stroke={c} strokeOpacity={0.3} strokeWidth={0.8} />
      <polygon points={pts([[x0, y1, z], [x1, y1, z], [x1, y1, z1], [x0, y1, z1]])} fill={c} fillOpacity={0.16} stroke={c} strokeOpacity={0.75} strokeWidth={1} />
      <polygon points={pts([[x1, y0, z], [x1, y1, z], [x1, y1, z1], [x1, y0, z1]])} fill={c} fillOpacity={0.1} stroke={c} strokeOpacity={0.75} strokeWidth={1} />
      <polygon className="nx-top" points={pts(rect(x0, y0, x1, y1, z1))} fill="none" stroke={c} strokeWidth={1.5} filter="url(#nxGlow)" />
      {lightsOn && <circle cx={bx} cy={by} r={3} fill="#fff3c4" filter="url(#nxGlow2)" />}
      {s.presence && (
        <g>
          <ellipse className="nx-ping" cx={px} cy={py} rx={9} ry={4.5} fill="none" stroke="#7cefff" />
          <ellipse cx={px} cy={py} rx={9} ry={4.5} fill="none" stroke="#7cefff" strokeOpacity={0.7} />
          <line x1={px} y1={py} x2={px} y2={py - 14} stroke="#bff8ff" strokeWidth={2.4} strokeLinecap="round" />
          <circle cx={px} cy={py - 18} r={3} fill="#bff8ff" />
        </g>
      )}
      {warn && (
        <g className="nx-warn" filter="url(#nxGlow2)">
          <path d={`M${wx} ${wy - 9} L${wx + 9} ${wy + 7} L${wx - 9} ${wy + 7} Z`} fill={warn} fillOpacity={0.25} stroke={warn} strokeWidth={1.6} strokeLinejoin="round" />
          <line x1={wx} y1={wy - 3} x2={wx} y2={wy + 2} stroke="#fff3c4" strokeWidth={1.8} strokeLinecap="round" />
          <circle cx={wx} cy={wy + 4.6} r={1} fill="#fff3c4" />
        </g>
      )}
    </g>
  );
}

/** Slab of a storey with a little thickness and dimension ticks, plus its short name (EG, OG …). */
function Slab({ z, floor }: { z: number; floor: number }) {
  const d = 0.35;
  const C = NX.cyan;
  const [tx, ty] = P([-0.9, 1.2, z]);
  return (
    <g>
      <polygon points={pts([[0, D, z - d], [W, D, z - d], [W, D, z], [0, D, z]])} fill={C} fillOpacity={0.1} stroke={C} strokeOpacity={0.35} />
      <polygon points={pts([[W, 0, z - d], [W, D, z - d], [W, D, z], [W, 0, z]])} fill={C} fillOpacity={0.07} stroke={C} strokeOpacity={0.35} />
      <polygon points={pts(rect(0, 0, W, D, z))} fill={C} fillOpacity={0.05} stroke={C} strokeOpacity={0.75} strokeWidth={1.4} filter="url(#nxGlow)" />
      {Array.from({ length: W + 1 }, (_, k) => {
        const [a, b] = P([k, D, z - d]);
        const [c2, e] = P([k, D + 0.45, z - d]);
        return <line key={k} x1={a} y1={b} x2={c2} y2={e} stroke={C} strokeOpacity={0.5} />;
      })}
      <text className="nx-tag" x={tx} y={ty} textAnchor="end">{FLOORS.find((f) => f.value === floor)?.short ?? ''}</text>
    </g>
  );
}

/** Floating gable roof with rafters and – if there is a PV system – solar panels on the front side. */
function Roof({ base, ridge, solar }: { base: number; ridge: number; solar: boolean }) {
  const a = -0.4;
  const b = W + 0.4;
  const c = -0.4;
  const d = D + 0.4;
  const m = D / 2;
  const C = NX.cyan;
  const onSlope = (u: number, v: number): V3 => [u, m + v * (d - m), ridge - v * (ridge - base)];
  return (
    <g>
      <polygon points={pts([[a, c, base], [b, c, base], [b, m, ridge], [a, m, ridge]])} fill={C} fillOpacity={0.04} stroke={C} strokeOpacity={0.35} />
      <polygon points={pts([[a, c, base], [a, d, base], [a, m, ridge]])} fill={C} fillOpacity={0.03} stroke={C} strokeOpacity={0.3} />
      <polygon points={pts([[a, m, ridge], [b, m, ridge], [b, d, base], [a, d, base]])} fill={C} fillOpacity={0.07} stroke={C} strokeOpacity={0.8} strokeWidth={1.3} filter="url(#nxGlow)" />
      <polygon points={pts([[b, c, base], [b, d, base], [b, m, ridge]])} fill={C} fillOpacity={0.12} stroke={C} strokeOpacity={0.85} strokeWidth={1.3} filter="url(#nxGlow)" />
      {Array.from({ length: 9 }, (_, k) => {
        const [x1, y1] = P([k * 1.5, m, ridge]);
        const [x2, y2] = P([k * 1.5, d, base]);
        return <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} stroke={C} strokeOpacity={0.18} />;
      })}
      {solar &&
        [0, 1].flatMap((row) =>
          Array.from({ length: 6 }, (_, col) => {
            const u0 = 0.9 + col * 1.72;
            const v0 = 0.14 + row * 0.36;
            return <polygon key={`${row}-${col}`} points={pts([onSlope(u0, v0), onSlope(u0 + 1.56, v0), onSlope(u0 + 1.56, v0 + 0.32), onSlope(u0, v0 + 0.32)])} fill={NX.amber} fillOpacity={0.3} stroke={NX.amber} strokeWidth={1} />;
          }),
        )}
    </g>
  );
}

export interface TwinProps {
  /** Indoor rooms (in the configured order). */
  rooms: RoomSummary[];
  /** Colour of rooms with an active warning / alarm, by room id. */
  alertColors: Record<string, string>;
  solar?: TwinExtra | null;
  heatpump?: TwinExtra | null;
  battery?: (TwinExtra & { soc: number }) | null;
  onRoom: (id: string) => void;
  /**
   * Callouts as cards in one column right of the house, storeys a bit closer and a smaller projector
   * (framed twin of the kiosk in portrait format): the house gets the width the left callouts took.
   */
  rail?: boolean;
}

/**
 * Data stream when a callout changes: the room lights up, a pulse runs along the line to the value (arrives
 * after STREAM_ARRIVE ms, until then the old value stays) and the new value glows up (until STREAM_END ms).
 * Only a real change of the shown value streams – the small sub line (e.g. live power) just updates.
 * The timings match the keyframes in nexus.css.
 */
const STREAM_ARRIVE = 950;
const STREAM_END = 1800;
interface Pulse {
  id: number;
  /** Shown until the pulse arrives. */
  old: string;
  at: number;
  arrived: boolean;
}
type Seen = Record<string, string>;
/** Placeholders (no reading yet) – getting the first reading is no change. */
const NO_VALUE = new Set(['', '—', '–', '-', '…', '?']);
let pulseSeq = 0;

/** Width of a rail card (grows into spare width of the box up to CARD_MAX) and the gap between house and card (viewBox units). */
const CARD_W = 222;
const CARD_MAX = 340;
const CARD_GAP = 42;

/** The hologram; fills its parent box (the parent needs a size). */
export function HomeTwin({ rooms, alertColors, solar, heatpump, battery, onRoom, rail = false }: TwinProps) {
  // the rising particles only move on "high"; below that they are invisible, so skip them
  const effects = useStore((s) => s.display.effects);
  const particles = effects === 'high';
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = useElementSize(ref, { w: 800, h: 500 });
  // callouts need some room; small screens show the names on the floors only
  const labels = w >= 440;
  const key = `${rooms.map((r) => `${r.room.id}:${floorOf(r.room)}`).join('|')}#${Boolean(heatpump)}${Boolean(battery)}${labels}${rail ? Math.round((w / Math.max(1, h)) * 20) : ''}`;
  // the geometry only changes with the room list, the storeys and the extras (see `key`)
  const geo = useMemo(() => {
    const g = layout(rooms, rail ? 4.6 : 5.6);
    const corners: V3[] = [];
    for (const [x, y] of [[-0.4, -0.4], [W + 0.4, -0.4], [W + 0.4, D + 0.4], [-0.4, D + 0.4]]) corners.push([x, y, -0.35], [x, y, g.roofBase]);
    corners.push([-0.4, D / 2, g.ridge], [W + 0.4, D / 2, g.ridge]);
    if (heatpump) corners.push([14.6, 8, g.ground]);
    if (battery) corners.push([1, 11.4, g.ground]);
    const xs = corners.map((p) => P(p)[0]);
    const ys = corners.map((p) => P(p)[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const houseW = (W + D) * K * S;
    const cx = P([W / 2, D / 2, 0])[0];
    const ey = Math.max(...ys) + (rail ? 26 : 46);
    const erx = houseW * (rail ? 0.56 : 0.62);
    const gutter = labels ? 185 : 26;
    const gl = rail ? 30 : gutter;
    const gr = rail ? (labels ? CARD_GAP + CARD_W + 4 : 30) : gutter;
    const vb = { x: minX - gl, y: minY - 28, w: maxX - minX + gl + gr, h: ey + erx * (rail ? 0.26 : 0.3) + (rail ? 8 : 20) - (minY - 28) };
    // rail in a box that is wider than the drawing: the cards take the spare width instead of empty margins
    const cardW = rail && labels ? clamp(CARD_W + (vb.h * w) / Math.max(1, h) - vb.w, CARD_W, CARD_MAX) : CARD_W;
    vb.w += cardW - CARD_W;
    const rnd = random(11);
    const beamTop = minY + 10;
    const particles = Array.from({ length: 32 }, () => {
      const y = beamTop + rnd() * (ey - beamTop - 20);
      const spreadX = erx * (0.85 + ((ey - y) / (ey - beamTop)) * 0.6);
      return { x: cx + (rnd() * 2 - 1) * spreadX, y, r: 0.5 + rnd() * 1.3, o: 0.25 + rnd() * 0.55, d: 7 + rnd() * 9, delay: -rnd() * 16, pink: rnd() < 0.22 };
    });
    return { ...g, minX, maxX, minY, cx, ey, erx, vb, cardW, beamTop, particles };
  }, [key]);

  const byId = new Map(rooms.map((r) => [r.room.id, r]));
  const levels = geo.floors.map((f, i) => ({ floor: f, z: i * geo.gap }));
  const { cx, ey, erx, vb } = geo;
  const ery = erx * 0.22;
  const groundZ = -(ey - P([W / 2, D / 2, 0])[1]) / S;

  // callouts: most interesting first, then split left / right of the house and spread out
  const callouts: Callout[] = [];
  for (const t of geo.tiles) {
    const s = byId.get(t.id);
    if (!s) continue;
    const alert = alertColors[t.id];
    const color = alert ?? (s.open.length ? NX.amber : tempColor(s.temp));
    const on = s.lights.filter(Boolean).length;
    const value = s.temp != null ? `${num(s.temp, 1)}°` : s.lights.length ? `${on}/${s.lights.length}` : `${s.deviceCount}`;
    const fallback = s.temp != null ? '' : s.lights.length ? 'Lichter an' : s.deviceCount === 1 ? 'Gerät' : 'Geräte';
    const prio = (alert || s.open.length ? 100 : 0) + (s.heating ? 45 : 0) + (s.presence ? 40 : 0) + (on ? 30 : 0) + (s.temp != null ? 20 : 0) + t.z * 0.1;
    callouts.push({ key: t.id, anchor: P([(t.x0 + t.x1) / 2, (t.y0 + t.y1) / 2, t.z + RH]), name: s.room.name, value, sub: roomSub(s) || fallback, color, prio, onClick: () => onRoom(t.id) });
  }
  const zMid = (geo.roofBase + geo.ridge) / 2;
  if (solar) callouts.push({ key: 'solar', anchor: P([W / 2, D * 0.75 + 0.1, zMid]), name: solar.name, value: solar.value, sub: solar.sub ?? '', color: solar.color, prio: 90, onClick: solar.onClick });
  if (heatpump) callouts.push({ key: 'hp', anchor: P([13.75, 6.8, geo.ground + 1.6]), name: heatpump.name, value: heatpump.value, sub: heatpump.sub ?? '', color: heatpump.color, prio: 70, onClick: heatpump.onClick });
  if (battery) callouts.push({ key: 'bat', anchor: P([1.9, 10.65, geo.ground + 2.2]), name: battery.name, value: battery.value, sub: battery.sub ?? '', color: battery.color, prio: 75, onClick: battery.onClick });
  // rail: the cards move closer together (down to one line each) so that all of them fit
  const top = vb.y + (rail ? 28 : 34);
  const bottom = vb.y + vb.h - (rail ? 28 : 40);
  const ROW = rail ? clamp((bottom - top) / Math.max(1, callouts.length - 1), 34, 62) : 66;
  const capacity = Math.max(1, Math.floor((bottom - top) / ROW) + 1);
  const picked = labels ? [...callouts].sort((a, b) => b.prio - a.prio).slice(0, capacity * (rail ? 1 : 2)) : [];
  let left = rail ? [] : picked.filter((c) => c.anchor[0] < cx);
  let right = rail ? picked : picked.filter((c) => c.anchor[0] >= cx);
  // rail cards: two lines (name above value) while there is room, otherwise name and value side by side
  const half = ROW >= 54 ? Math.min(26, (ROW - 8) / 2) : (ROW - 6) / 2;
  while (left.length > capacity) {
    const m = left.reduce((a, b) => (b.anchor[0] > a.anchor[0] ? b : a));
    left = left.filter((c) => c !== m);
    right = [...right, m];
  }
  while (right.length > capacity) {
    const m = right.reduce((a, b) => (b.anchor[0] < a.anchor[0] ? b : a));
    right = right.filter((c) => c !== m);
    left = [...left, m];
  }
  const placed = [
    ...spread(left, top, bottom, ROW).map((p) => ({ ...p, side: 'l' as const })),
    ...spread(right, top, bottom, ROW).map((p) => ({ ...p, side: 'r' as const })),
  ];

  // data streams: changes are detected while rendering, so no frame shows the new value before its pulse
  const seenNow: Seen = {};
  for (const { c } of placed) seenNow[c.key] = c.value;
  const sig = JSON.stringify(seenNow);
  const [flow, setFlow] = useState<{ sig: string; seen: Seen; pulses: Record<string, Pulse> }>(() => ({ sig, seen: seenNow, pulses: {} }));
  if (flow.sig !== sig) {
    const pulses = { ...flow.pulses };
    for (const { c } of placed) {
      const before = flow.seen[c.key];
      if (effects === 'low' || before == null || before === c.value || NO_VALUE.has(before.trim()) || NO_VALUE.has(c.value.trim())) continue;
      // a pulse on its way keeps going and delivers the newest value
      if (pulses[c.key] && !pulses[c.key].arrived) continue;
      pulses[c.key] = { id: ++pulseSeq, old: before, at: Date.now(), arrived: false };
    }
    setFlow({ sig, seen: seenNow, pulses });
  }
  const pending = Object.entries(flow.pulses).map(([k, p]) => `${k}:${p.id}:${p.arrived}`).join('|');
  useEffect(() => {
    const timers = Object.entries(flow.pulses).map(([k, p]) =>
      window.setTimeout(() => {
        setFlow((f) => {
          if (f.pulses[k]?.id !== p.id) return f;
          const pulses = { ...f.pulses };
          if (p.arrived) delete pulses[k];
          else pulses[k] = { ...p, arrived: true };
          return { ...f, pulses };
        });
      }, Math.max(0, (p.arrived ? STREAM_END : STREAM_ARRIVE) - (Date.now() - p.at))),
    );
    return () => timers.forEach((t) => clearTimeout(t));
    // the timers only change with the pulses (see `pending`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  // ground grid of the holo table (iso lines, faded out towards the edges)
  const grid: Pt[][] = [];
  for (let k = -12; k <= 24; k += 1.5) grid.push([P([k, -10, groundZ]), P([k, 20, groundZ])], [P([-10, k, groundZ]), P([22, k, groundZ])]);

  return (
    <div ref={ref} className="absolute inset-0">
      <svg className="w-full h-full overflow-visible" viewBox={`${vb.x.toFixed(0)} ${vb.y.toFixed(0)} ${vb.w.toFixed(0)} ${vb.h.toFixed(0)}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Digitaler Zwilling des Hauses">
        <defs>
          <filter id="nxGlow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <filter id="nxGlow2" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <linearGradient id="nxBeam" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor={NX.cyan} stopOpacity=".2" /><stop offset=".6" stopColor={NX.cyan} stopOpacity=".05" /><stop offset="1" stopColor={NX.cyan} stopOpacity="0" /></linearGradient>
          <radialGradient id="nxEmit"><stop offset="0" stopColor="#bff8ff" stopOpacity=".95" /><stop offset=".35" stopColor={NX.cyan} stopOpacity=".55" /><stop offset="1" stopColor={NX.cyan} stopOpacity="0" /></radialGradient>
          <radialGradient id="nxWarm"><stop offset="0" stopColor="#ffd36b" stopOpacity=".55" /><stop offset="1" stopColor={NX.amber} stopOpacity="0" /></radialGradient>
          <radialGradient id="nxHeat"><stop offset="0" stopColor={NX.orange} stopOpacity=".45" /><stop offset="1" stopColor={NX.orange} stopOpacity="0" /></radialGradient>
          <radialGradient id="nxGridFade" cx={cx} cy={ey} r={erx * 2.1} gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#fff" stopOpacity=".9" /><stop offset=".55" stopColor="#fff" stopOpacity=".25" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
          <mask id="nxGridMask"><rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="url(#nxGridFade)" /></mask>
        </defs>

        <g mask="url(#nxGridMask)" stroke={NX.cyan} strokeOpacity={0.22} strokeWidth={1}>
          {grid.map(([a, b], i) => <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />)}
        </g>

        {/* projector: light cone, rays, rings */}
        <polygon points={`${cx - erx * 0.85},${ey} ${cx + erx * 0.85},${ey} ${cx + erx * 1.5},${geo.beamTop} ${cx - erx * 1.5},${geo.beamTop}`} fill="url(#nxBeam)" />
        {Array.from({ length: 9 }, (_, k) => {
          const x = cx - erx * 0.8 + (k * erx * 1.6) / 8;
          return <line key={k} x1={x} y1={ey} x2={cx + (x - cx) * 1.75} y2={geo.beamTop + 20} stroke={NX.cyan} strokeOpacity={0.05} />;
        })}
        <ellipse cx={cx} cy={ey} rx={erx * 1.22} ry={ery * 1.22} fill="none" stroke={NX.cyan} strokeOpacity={0.18} />
        <ellipse className="nx-ring" cx={cx} cy={ey} rx={erx} ry={ery} fill="none" stroke={NX.cyan} strokeOpacity={0.55} strokeWidth={3} strokeDasharray="1 7" />
        <ellipse cx={cx} cy={ey} rx={erx * 0.8} ry={ery * 0.8} fill={NX.cyan} fillOpacity={0.05} stroke={NX.cyan} strokeOpacity={0.8} strokeWidth={1.5} filter="url(#nxGlow)" />
        <ellipse cx={cx} cy={ey} rx={erx * 0.58} ry={ery * 0.58} fill="url(#nxEmit)" opacity={0.75} />
        <ellipse className="nx-orbit" cx={cx} cy={ey} rx={erx} ry={ery} fill="none" stroke={NX.magenta} strokeWidth={2.5} pathLength={100} strokeDasharray="16 84" filter="url(#nxGlow)" />
        <ellipse className="nx-orbit nx-orbit-rev" cx={cx} cy={ey} rx={erx * 1.22} ry={ery * 1.22} fill="none" stroke={NX.cyan} strokeWidth={2} pathLength={100} strokeDasharray="10 90" filter="url(#nxGlow)" />

        {/* orbit around the lowest storey */}
        <ellipse className="nx-orbit" cx={cx} cy={P([W / 2, D / 2, 0.6])[1]} rx={erx * 1.12} ry={erx * 0.27} fill="none" stroke="#a78bfa" strokeOpacity={0.85} strokeWidth={2} pathLength={100} strokeDasharray="22 78" />

        {particles && geo.particles.map((p, i) => (
          <circle key={i} className="nx-particle" cx={p.x} cy={p.y} r={p.r} fill={p.pink ? '#ff9bf0' : '#bff8ff'} style={{ ['--o' as string]: p.o, animationDuration: `${p.d}s`, animationDelay: `${p.delay}s` }} />
        ))}

        {/* storeys from the bottom up, each with its rooms (back to front) */}
        {levels.map(({ floor, z }, i) => (
          <g key={floor}>
            {i > 0 &&
              [[0, 0], [W, 0], [W, D], [0, D]].map(([x, y]) => {
                const [a, b] = P([x, y, levels[i - 1].z + RH]);
                const [c2, e] = P([x, y, z - 0.35]);
                return <line key={`${x}-${y}`} x1={a} y1={b} x2={c2} y2={e} stroke={NX.cyan} strokeOpacity={0.45} strokeDasharray="2 4" />;
              })}
            <Slab z={z} floor={floor} />
            {z === geo.ground && heatpump && (
              <g className="nx-click" onClick={heatpump.onClick} role="button" aria-label={heatpump.name}>
                <line x1={P([12.9, 6.8, z + 0.5])[0]} y1={P([12.9, 6.8, z + 0.5])[1]} x2={P([12, 6.8, z + 0.5])[0]} y2={P([12, 6.8, z + 0.5])[1]} stroke={NX.orange} strokeWidth={1.4} strokeDasharray="3 2" />
                <Box x0={12.9} y0={5.6} x1={14.6} y1={8} z0={z} z1={z + 1.6} color={NX.orange} />
              </g>
            )}
            {geo.tiles
              .filter((t) => t.z === z)
              .sort((a, b) => a.x0 + a.y0 - (b.x0 + b.y0))
              .map((t) => {
                const s = byId.get(t.id);
                return s ? <RoomTile key={t.id} t={t} s={s} alert={alertColors[t.id]} onClick={() => onRoom(t.id)} /> : null;
              })}
            {z === geo.ground && battery && (
              <g className="nx-click" onClick={battery.onClick} role="button" aria-label={battery.name}>
                <Box x0={1} y0={9.9} x1={2.8} y1={11.4} z0={z} z1={z + (2.2 * Math.min(100, Math.max(0, battery.soc))) / 100} color={NX.green} top={0.35} />
                <polygon points={pts([[1, 11.4, z], [2.8, 11.4, z], [2.8, 11.4, z + 2.2], [1, 11.4, z + 2.2]])} fill="none" stroke={NX.green} strokeOpacity={0.6} />
                <polygon points={pts([[2.8, 9.9, z], [2.8, 11.4, z], [2.8, 11.4, z + 2.2], [2.8, 9.9, z + 2.2]])} fill="none" stroke={NX.green} strokeOpacity={0.6} />
                <polygon points={pts(rect(1, 9.9, 2.8, 11.4, z + 2.2))} fill="none" stroke={NX.green} strokeOpacity={0.6} />
              </g>
            )}
          </g>
        ))}
        {levels.length > 0 && (
          <>
            {[[0, 0], [W, 0], [W, D], [0, D]].map(([x, y]) => {
              const [a, b] = P([x, y, geo.top + RH]);
              const [c2, e] = P([x, y, geo.roofBase]);
              return <line key={`r${x}-${y}`} x1={a} y1={b} x2={c2} y2={e} stroke={NX.cyan} strokeOpacity={0.45} strokeDasharray="2 4" />;
            })}
            <g className={solar?.onClick ? 'nx-click' : undefined} onClick={solar?.onClick}>
              <Roof base={geo.roofBase} ridge={geo.ridge} solar={Boolean(solar)} />
            </g>
          </>
        )}

        {/* data streams, part 1: the room whose value changed lights up */}
        {Object.entries(flow.pulses).map(([k, p]) => {
          const t = !p.arrived && geo.tiles.find((x) => x.id === k);
          const c = t && callouts.find((x) => x.key === k);
          if (!t || !c) return null;
          return (
            <g key={p.id} className="nx-flash" style={{ color: c.color }}>
              <polygon className="f" points={pts(rect(t.x0, t.y0, t.x1, t.y1, t.z))} />
              <polygon points={pts(rect(t.x0, t.y0, t.x1, t.y1, t.z + RH))} fill="none" stroke="currentColor" strokeWidth={2.5} filter="url(#nxGlow2)" />
            </g>
          );
        })}

        {placed.map(({ c, y, side }) => {
          const l = side === 'l';
          const edge = l ? geo.minX - 18 : geo.maxX + 18;
          const end = l ? edge - 18 : edge + 18;
          const tx = l ? end - 8 : end + 8;
          const anchor = l ? 'end' : 'start';
          const target = rail ? geo.maxX + CARD_GAP : end;
          const [ax, ay] = [c.anchor[0].toFixed(1), c.anchor[1].toFixed(1)];
          const pulse = flow.pulses[c.key];
          const travelling = pulse != null && !pulse.arrived;
          const value = travelling ? pulse.old : c.value;
          const subText = c.sub;
          // the value (and the card) remount when the pulse arrives, so their glow starts again
          const upd = pulse?.arrived ? ' nx-upd' : '';
          const vkey = pulse?.arrived ? `u${pulse.id}` : 'v';
          // data streams, part 2: a pulse from the room along the line; part 3: a ripple where it arrives
          const stream = travelling ? (
            <g key={`s${pulse.id}`} className="nx-stream" style={{ color: c.color }}>
              <circle className="nx-burst" cx={ax} cy={ay} r={7} fill="none" stroke="currentColor" strokeWidth={2} />
              <path className="nx-trail" d={`M${ax} ${ay} L${edge} ${y} L${target} ${y}`} pathLength={100} filter="url(#nxGlow2)" />
              <path className="nx-head" d={`M${ax} ${ay} L${edge} ${y} L${target} ${y}`} pathLength={100} />
            </g>
          ) : pulse ? (
            <circle key={`r${pulse.id}`} className="nx-burst nx-arrive" cx={target} cy={y} r={6} fill="none" stroke={c.color} strokeWidth={2} />
          ) : null;
          if (rail) {
            const x = target;
            const cw = geo.cardW;
            const tall = ROW >= 54;
            const room = 15 + Math.floor((cw - CARD_W) / 7);
            const sub = subText.length > room ? `${subText.slice(0, room - 1)}…` : subText;
            return (
              <g key={c.key} className="nx-callout" onClick={c.onClick} role="button" aria-label={`${c.name} ${c.value}`}>
                <polyline points={`${ax},${ay} ${edge},${y} ${x},${y}`} fill="none" stroke={c.color} strokeOpacity={0.6} />
                <circle cx={c.anchor[0]} cy={c.anchor[1]} r={7} fill="none" stroke={c.color} strokeOpacity={0.45} />
                <circle cx={c.anchor[0]} cy={c.anchor[1]} r={2.8} fill={c.color} filter="url(#nxGlow2)" />
                <path key={vkey} className={`nx-card${upd}`} style={upd ? { color: c.color } : undefined} d={`M${x + 8} ${y - half} H${x + cw} V${y + half - 8} L${x + cw - 8} ${y + half} H${x} V${y - half + 8} Z`} stroke={c.color} />
                <rect x={x} y={y - half + 8} width={3} height={half * 2 - 16} fill={c.color} filter="url(#nxGlow2)" />
                {tall ? (
                  <>
                    <text className="nx-cn" x={x + 14} y={y - 7}>{c.name.toUpperCase()}</text>
                    <text key={vkey} className={`nx-cv${upd}`} style={upd ? { color: c.color } : undefined} x={x + 14} y={y + 19} fill={c.color}>{value}</text>
                    {sub && <text className="nx-cs" x={x + cw - 10} y={y + 17} textAnchor="end">{sub}</text>}
                  </>
                ) : (
                  <>
                    <text className="nx-cn" x={x + 14} y={y + 5}>{c.name.length > 12 ? `${c.name.slice(0, 11).toUpperCase()}…` : c.name.toUpperCase()}</text>
                    <text key={vkey} className={`nx-cv nx-cv-sm${upd}`} style={upd ? { color: c.color } : undefined} x={x + cw - 10} y={y + 7} textAnchor="end" fill={c.color}>{value}</text>
                  </>
                )}
                {stream}
              </g>
            );
          }
          return (
            <g key={c.key} className="nx-callout" onClick={c.onClick} role="button" aria-label={`${c.name} ${c.value}`}>
              <polyline points={`${ax},${ay} ${edge},${y} ${end},${y}`} fill="none" stroke={c.color} strokeOpacity={0.75} />
              <circle cx={c.anchor[0]} cy={c.anchor[1]} r={7} fill="none" stroke={c.color} strokeOpacity={0.45} />
              <circle cx={c.anchor[0]} cy={c.anchor[1]} r={2.8} fill={c.color} filter="url(#nxGlow2)" />
              <rect x={end - 3} y={y - 3} width={6} height={6} fill={c.color} transform={`rotate(45 ${end} ${y})`} />
              <text className="nx-cn" x={tx} y={y - 15} textAnchor={anchor}>{c.name.toUpperCase()}</text>
              <text key={vkey} className={`nx-cv${upd}`} style={upd ? { color: c.color } : undefined} x={tx} y={y + 8} textAnchor={anchor} fill={c.color}>{value}</text>
              {subText && <text className="nx-cs" x={tx} y={y + 26} textAnchor={anchor}>{subText}</text>}
              {stream}
            </g>
          );
        })}
      </svg>
      {rooms.length === 0 && (
        <div className="absolute inset-0 grid place-items-center text-center pointer-events-none">
          <p className="nx-empty">Noch keine Räume mit Geräten – unter Einstellungen → Räume / Geräte einrichten.</p>
        </div>
      )}
    </div>
  );
}
