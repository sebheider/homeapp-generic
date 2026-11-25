/**
 * Energy system components: the `useEnergy` hook (normalised live values), the history curves
 * (`useEnergySeries`), the animated flow diagram and the battery gauge. Used by the dashboard and
 * the energy page.
 */
import { motion } from 'motion/react';
import { BatteryCharging, Car, House, PlugZap, Sun } from 'lucide-react';
import { useStateValues, useStore } from '../lib/store';
import { flowDuration } from '../lib/perf';
import { clamp, num, power, toNum } from '../lib/format';
import { useStaticVisuals } from './ui';
import { useHistory, type ChartSeries } from './Charts';

/** Flows below this power (watts) count as idle (measurement noise). */
export const IDLE_W = 15;

/** Normalised live values of the energy system (watts; grid > 0 = import, battery > 0 = discharge). */
export interface EnergyValues {
  enabled: boolean;
  pv: number;
  home: number;
  grid: number;
  battery: number;
  soc: number | null;
  wallbox: number | null;
  autarky: number | null;
  selfConsumption: number | null;
  dailyYield: number | null;
  hasBattery: boolean;
  hasGrid: boolean;
}

/**
 * Reads the configured energy datapoints and applies the sign conventions of
 * the installation (gridInvert / batteryInvert), so that all components can
 * rely on one unified meaning of the numbers.
 */
export function useEnergy(): EnergyValues {
  const cfg = useStore((s) => s.config?.energy);
  const st = cfg?.states || {};
  const vals = useStateValues(st);
  const has = (k: string) => Boolean(st[k]) && vals[k] != null;
  const grid = toNum(vals.grid) * (cfg?.gridInvert ? -1 : 1);
  const battery = toNum(vals.battery) * (cfg?.batteryInvert ? -1 : 1);
  const pv = toNum(vals.production);
  // Without a dedicated consumption datapoint the house load follows from the balance
  const home = has('consumption') ? toNum(vals.consumption) : Math.max(0, pv + grid + battery);
  return {
    enabled: Boolean(cfg?.enabled),
    pv,
    home,
    grid,
    battery,
    soc: has('batterySoc') ? toNum(vals.batterySoc) : null,
    wallbox: has('wallbox') ? toNum(vals.wallbox) : null,
    autarky: has('autarky') ? toNum(vals.autarky) : null,
    selfConsumption: has('selfConsumption') ? toNum(vals.selfConsumption) : null,
    dailyYield: has('dailyYield') ? toNum(vals.dailyYield) : null,
    hasBattery: Boolean(st.battery),
    hasGrid: Boolean(st.grid),
  };
}

/** Energy datapoints that have a history chart. */
const HISTORY_KEYS = ['production', 'consumption', 'grid', 'battery', 'batterySoc'];
const NO_STATES: Record<string, string> = {};

/**
 * History curves of the energy system for the last `hours`, with the same sign conventions as the
 * live values: `power` (production and consumption), `flow` (grid and battery) and `soc` (battery
 * charge). Only datapoints that are configured get a series; `hours = 0` loads nothing.
 */
export function useEnergySeries(hours: number) {
  const cfg = useStore((s) => s.config?.energy);
  const st = cfg?.states ?? NO_STATES;
  const { data } = useHistory(hours > 0 ? HISTORY_KEYS.map((k) => st[k]).filter(Boolean) : [], hours);
  const series = (key: string, label: string, color: string, factor = 1, line = false): ChartSeries | null =>
    st[key] ? { id: key, label, color, line, data: (data[st[key]] ?? []).map(([t, v]) => [t, v * factor] as [number, number]) } : null;
  const present = (list: (ChartSeries | null)[]) => list.filter(Boolean) as ChartSeries[];
  return {
    power: present([series('production', 'Solar', '#facc15'), series('consumption', 'Verbrauch', '#a78bfa', 1, true)]),
    flow: present([
      series('grid', 'Netz (+ Bezug)', '#38bdf8', cfg?.gridInvert ? -1 : 1, true),
      series('battery', 'Batterie (+ Entladen)', '#34d399', cfg?.batteryInvert ? -1 : 1, true),
    ]),
    soc: present([series('batterySoc', 'Ladestand', '#34d399')]),
  };
}

interface NodeProps {
  x: number;
  y: number;
  icon: React.ReactNode;
  label: string;
  watts: number | null;
  color: string;
  active: boolean;
  sub?: string;
  big?: boolean;
  /** Where the caption stands: below the circle (default) or beside it. */
  caption?: 'below' | 'left' | 'right';
}

/**
 * A node of the flow diagram: the circle is centred on (x, y) in percent of the diagram box, the caption
 * hangs below (or beside) it. Circle and texts are sized relative to the box width (see `.flow-node` in
 * index.css), so the layout looks the same at every size.
 */
function Node({ x, y, icon, label, watts, color, active, sub, big, caption = 'below' }: NodeProps) {
  const staticVisuals = useStaticVisuals();
  const p = power(watts === null ? null : Math.abs(watts));
  return (
    <div className={`flow-node ${big ? 'flow-node-lg' : ''}`} style={{ left: `${x}%`, top: `${y}%` }}>
      <div
        className={`flow-circle ${active && !staticVisuals ? 'glow-pulse' : ''}`}
        style={{ ['--tone' as string]: color, background: `color-mix(in srgb, ${color} ${active ? 22 : 10}%, var(--bg2))`, border: `2px solid color-mix(in srgb, ${color} ${active ? 70 : 25}%, transparent)`, color }}
      >
        <span className="flow-icon">{icon}</span>
        <span className="flow-val font-bold rounded-full tabular-nums" style={{ background: 'var(--bg2)', color: 'var(--fg)', border: '1px solid var(--line)' }}>
          {watts === null ? '–' : `${p.value} ${p.unit}`}
        </span>
      </div>
      <div className={`flow-caption ${caption !== 'below' ? `flow-caption-${caption}` : ''}`}>
        <div className="flow-label font-semibold">{label}</div>
        {sub && <div className="flow-sub text-muted">{sub}</div>}
      </div>
    </div>
  );
}

/** A line of the flow diagram in view box coordinates, drawn in the direction of the energy flow. */
interface FlowLine {
  from: [number, number];
  to: [number, number];
  watts: number;
  color: string;
}

/** Height of the flow diagram in view box units (400 wide); the wallbox needs another row. */
export const energyFlowHeight = (wallbox: boolean) => (wallbox ? 370 : 310);

/**
 * Animated energy flow with the house as hub in the middle: PV on top, grid and battery in the lower
 * corners and (optionally) the wallbox at the bottom, so the nodes use the whole box. Dashes move in the
 * direction of the energy flow and get faster and thicker with more power. `bold`: larger figures and
 * captions for small scaled-down boxes (kiosk overview).
 */
export function EnergyFlow({ e, bold = false }: { e: EnergyValues; bold?: boolean }) {
  const W = 400;
  const wb = e.wallbox !== null;
  const H = energyFlowHeight(wb);
  // circle centres in view box units; the captions hang below the circles (PV: beside it; house: beside
  // it when the wallbox line leaves the house downwards)
  const pos = wb
    ? { pv: [200, 44], home: [200, 160], grid: [62, 205], bat: [338, 205], wb: [200, 290] } as const
    : { pv: [200, 44], home: [200, 172], grid: [62, 218], bat: [338, 218], wb: [200, 290] } as const;
  const lines: FlowLine[] = [];
  if (e.pv > IDLE_W) lines.push({ from: [...pos.pv], to: [...pos.home], watts: e.pv, color: '#facc15' });
  if (Math.abs(e.grid) > IDLE_W) {
    lines.push(e.grid > 0 ? { from: [...pos.grid], to: [...pos.home], watts: e.grid, color: '#94a3b8' } : { from: [...pos.home], to: [...pos.grid], watts: -e.grid, color: '#38bdf8' });
  }
  if (e.hasBattery && Math.abs(e.battery) > IDLE_W) {
    lines.push(e.battery > 0 ? { from: [...pos.bat], to: [...pos.home], watts: e.battery, color: '#34d399' } : { from: [...pos.home], to: [...pos.bat], watts: -e.battery, color: '#34d399' });
  }
  if (e.wallbox !== null && e.wallbox > IDLE_W) lines.push({ from: [...pos.home], to: [...pos.wb], watts: e.wallbox, color: '#22d3ee' });

  // the nodes are HTML elements on top of the SVG, positioned in percent of the box
  const pct = (p: readonly number[]) => ({ x: (p[0] / W) * 100, y: (p[1] / H) * 100 });
  const batLabel = e.battery > IDLE_W ? 'Entlädt' : e.battery < -IDLE_W ? 'Lädt' : 'Bereit';
  const gridLabel = e.grid > IDLE_W ? 'Netzbezug' : e.grid < -IDLE_W ? 'Einspeisung' : 'Netz';

  return (
    <div className={`flow-box relative w-full max-w-xl mx-auto ${bold ? 'flow-bold' : ''}`} style={{ aspectRatio: `${W} / ${H}` }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full">
        {lines.map((l, i) => {
          // stroke width grows with the power
          const sw = clamp(2 + l.watts / 1200, 2, 7);
          return (
            <g key={i}>
              <line x1={l.from[0]} y1={l.from[1]} x2={l.to[0]} y2={l.to[1]} stroke={l.color} strokeOpacity="0.18" strokeWidth={sw + 4} strokeLinecap="round" />
              <line className="flow-line" style={{ animationDuration: `${flowDuration(l.watts) / 2.6}s` }} x1={l.from[0]} y1={l.from[1]} x2={l.to[0]} y2={l.to[1]} stroke={l.color} strokeWidth={sw} strokeLinecap="round" />
            </g>
          );
        })}
      </svg>
      <Node {...pct(pos.pv)} icon={<Sun size={34} className={e.pv > IDLE_W ? 'anim-spin' : ''} style={e.pv > IDLE_W ? { animationDuration: '14s' } : undefined} />} label="Solar" watts={e.pv} color="#facc15" active={e.pv > IDLE_W} sub={e.dailyYield !== null ? `heute ${num(e.dailyYield, 1)} kWh` : undefined} caption="right" />
      {e.hasGrid && <Node {...pct(pos.grid)} icon={<PlugZap size={30} />} label={gridLabel} watts={e.grid} color={e.grid < 0 ? '#38bdf8' : '#94a3b8'} active={Math.abs(e.grid) > IDLE_W} />}
      <Node {...pct(pos.home)} icon={<House size={38} />} label="Haus" watts={e.home} color="#a78bfa" active big caption={wb ? 'left' : 'below'} />
      {e.hasBattery && (
        <Node {...pct(pos.bat)} icon={<BatteryCharging size={30} className={e.battery < -IDLE_W ? 'anim-bob' : ''} />} label={batLabel} watts={e.battery} color="#34d399" active={Math.abs(e.battery) > IDLE_W} sub={e.soc !== null ? `${Math.round(e.soc)} %` : undefined} />
      )}
      {e.wallbox !== null && <Node {...pct(pos.wb)} icon={<Car size={30} />} label="Wallbox" watts={e.wallbox} color="#22d3ee" active={e.wallbox > IDLE_W} />}
    </div>
  );
}

/** Horizontal battery gauge with charge-state colouring (red < 20 %, amber < 50 %, green); shimmers while charging. */
export function BatteryBar({ soc, charging }: { soc: number; charging: boolean }) {
  const staticVisuals = useStaticVisuals();
  const color = soc < 20 ? '#fb7185' : soc < 50 ? '#fbbf24' : '#34d399';
  return (
    <div className="relative h-4 rounded-full overflow-hidden" style={{ background: 'var(--track)' }}>
      {staticVisuals
        ? <div className="h-full rounded-full" style={{ background: color, width: `${clamp(soc, 0, 100)}%` }} />
        : <motion.div className="h-full rounded-full" style={{ background: color }} initial={false} animate={{ width: `${clamp(soc, 0, 100)}%` }} transition={{ type: 'spring', stiffness: 80, damping: 20 }} />}
      {charging && <div className="absolute inset-0 skeleton opacity-70" />}
    </div>
  );
}
