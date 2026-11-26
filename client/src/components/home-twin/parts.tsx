/** SVG parts of the digital twin: room tiles with their floor text, storey slabs, the roof and glass boxes. */
import { FLOORS, type RoomSummary } from '../../lib/overview';
import { W, D, RH, K, P, pts, rect, type V3, type Tile } from './geometry';
import { NX, tempColor } from './colors';

/** A glass box (used for heat pump and battery). */
export function Box({ x0, y0, x1, y1, z0, z1, color, top = 0.22 }: { x0: number; y0: number; x1: number; y1: number; z0: number; z1: number; color: string; top?: number }) {
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
export function RoomTile({ t, s, alert, onClick }: { t: Tile; s: RoomSummary; alert?: string; onClick: () => void }) {
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
export function Slab({ z, floor }: { z: number; floor: number }) {
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
export function Roof({ base, ridge, solar }: { base: number; ridge: number; solar: boolean }) {
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
