/** Energy in the "Nexus" design: compact live flow and the production / consumption of the last 24 hours. */
import { useStore } from '../../lib/store';
import { clamp, num, pad2, powerText } from '../../lib/format';
import { NO_STATES } from '../../lib/selectors';
import { useNow } from '../../lib/hooks';
import { flowDuration } from '../../lib/perf';
import type { Series } from '../../lib/types';
import { IDLE_W, type EnergyValues } from '../../components/Energy';
import { useHistory } from '../../components/Charts';
import { NX } from '../../components/HomeTwin';
import { Panel } from './Panel';

/** Averages of a series in `n` equal time slots over the last `h` hours (null = no data). */
function bins(series: Series | undefined, n: number, h: number, now: number) {
  const from = now - h * 3600e3;
  const step = (h * 3600e3) / n;
  const sum = new Array<number>(n).fill(0);
  const cnt = new Array<number>(n).fill(0);
  for (const [t, v] of series ?? []) {
    const i = Math.floor((t - from) / step);
    if (i >= 0 && i < n && Number.isFinite(v)) {
      sum[i] += v;
      cnt[i]++;
    }
  }
  return sum.map((s, i) => (cnt[i] ? s / cnt[i] : null));
}

/**
 * Compact flow: solar, battery, house and grid as hexagons with moving dots on the active lines.
 * The dots live in their own SVG on top: otherwise every frame would also repaint the glow
 * filters of the static lines and hexagons. Without effects ("low") there are no dots at all
 * (SMIL animations are not stopped by the CSS of `[data-effects]`).
 */
function FlowStrip({ e }: { e: EnergyValues }) {
  const effects = useStore((s) => s.display.effects);
  const hasBat = e.soc != null || e.hasBattery;
  const nodes = [
    { key: 'pv', label: 'SOLAR', value: powerText(e.pv), color: NX.amber, path: 'M12 4v2M12 18v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4 12h2M18 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z' },
    ...(hasBat ? [{ key: 'bat', label: 'BATTERIE', value: `${e.soc != null ? `${num(e.soc, 0)} %` : ''}${Math.abs(e.battery) > IDLE_W ? ` · ${e.battery < 0 ? '+' : '−'}${powerText(Math.abs(e.battery))}` : ''}`, color: NX.green, path: 'M4 7h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM22 11v2M6 10v4M10 10v4' }] : []),
    { key: 'home', label: 'HAUS', value: powerText(e.home), color: '#a78bfa', path: 'M3 10.5 12 3l9 7.5V21H3zM9 21v-6h6v6' },
    ...(e.hasGrid ? [{ key: 'grid', label: e.grid < -IDLE_W ? 'EINSPEISUNG' : 'NETZ', value: powerText(Math.abs(e.grid)), color: NX.muted, path: 'M12 2v20M6 6h12M7.5 11h9M9 6 6 22M15 6l3 16' }] : []),
  ];
  const y = 34;
  const step = nodes.length > 1 ? 330 / (nodes.length - 1) : 0;
  const x = (k: string) => 40 + nodes.findIndex((n) => n.key === k) * step;
  const flows: { d: string; color: string; active: boolean; watts: number }[] = [];
  const pv = e.pv > IDLE_W;
  if (hasBat) {
    // without a battery flow the whole production goes to the house (or the grid)
    flows.push({ d: `M${x('pv')} ${y - 22} Q${(x('pv') + x('home')) / 2} ${y - 52} ${x('home')} ${y - 22}`, color: NX.amber, active: pv, watts: Math.max(0, e.pv + Math.min(0, e.battery)) });
    flows.push({ d: `M${x('pv') + 22} ${y} H${x('bat') - 22}`, color: NX.green, active: e.battery < -IDLE_W, watts: e.battery });
    flows.push({ d: `M${x('bat') + 22} ${y} H${x('home') - 22}`, color: NX.green, active: e.battery > IDLE_W, watts: e.battery });
  } else {
    flows.push({ d: `M${x('pv') + 22} ${y} H${x('home') - 22}`, color: NX.amber, active: pv, watts: e.pv });
  }
  if (e.hasGrid) {
    const imp = e.grid > IDLE_W;
    flows.push({ d: imp ? `M${x('grid') - 22} ${y} H${x('home') + 22}` : `M${x('home') + 22} ${y} H${x('grid') - 22}`, color: imp ? NX.cyan : NX.amber, active: Math.abs(e.grid) > IDLE_W, watts: e.grid });
  }
  const hex = (cx: number) => [0, 60, 120, 180, 240, 300].map((a) => `${(cx + 21 * Math.cos(((a - 90) * Math.PI) / 180)).toFixed(1)},${(y + 21 * Math.sin(((a - 90) * Math.PI) / 180)).toFixed(1)}`).join(' ');
  const moving = effects !== 'low' ? flows.filter((f) => f.active) : [];
  return (
    <div className="nx-flow">
    <svg viewBox="0 -24 410 116" aria-hidden>
      {flows.map((f, i) => (
        <path key={i} className={f.active ? 'nx-glow' : undefined} d={f.d} fill="none" stroke={f.active ? f.color : NX.muted} strokeOpacity={f.active ? 0.85 : 0.3} strokeWidth={f.active ? 2 : 1.4} strokeDasharray={f.active ? undefined : '3 4'} style={f.active ? { ['--glow' as string]: f.color } : undefined} />
      ))}
      {nodes.map((n, i) => {
        const cx = 40 + i * step;
        return (
          <g key={n.key}>
            <polygon className="nx-glow" points={hex(cx)} fill={n.color} fillOpacity={0.14} stroke={n.color} strokeWidth={1.5} style={{ ['--glow' as string]: n.color }} />
            <svg x={cx - 10} y={y - 10} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={n.color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={n.path} /></svg>
            <text x={cx} y={y + 40} textAnchor="middle" fill={n.color}>{n.value || '–'}</text>
            <text className="l" x={cx} y={y + 56} textAnchor="middle">{n.label}</text>
          </g>
        );
      })}
    </svg>
    {moving.length > 0 && (
      <svg className="nx-flow-dots" viewBox="0 -24 410 116" aria-hidden>
        {moving.map((f) => {
          const dur = flowDuration(f.watts);
          return [0, 1, 2].map((k) => (
            <circle key={`${f.d}-${k}`} r="2.6" fill="#fff8e0">
              <animateMotion dur={`${dur}s`} repeatCount="indefinite" path={f.d} begin={`${(-k * dur) / 3}s`} />
            </circle>
          ));
        })}
      </svg>
    )}
    </div>
  );
}

/** Production (up) and consumption (down) of the last 24 hours in 15-minute bars. */
function Waveform({ prod, cons, now }: { prod: (number | null)[]; cons: (number | null)[]; now: number }) {
  const N = prod.length;
  const W = 960;
  const axis = 54;
  const maxP = Math.max(1, ...prod.map((v) => v ?? 0));
  const maxC = Math.max(1, ...cons.map((v) => v ?? 0));
  const pitch = W / N;
  const from = now - 24 * 3600e3;
  const labels: { x: number; text: string }[] = [];
  const first = new Date(from);
  first.setMinutes(0, 0, 0);
  for (let t = first.getTime() + 3600e3; t < now; t += 3600e3) {
    const h = new Date(t).getHours();
    const x = ((t - from) / (24 * 3600e3)) * 100;
    // keep the right end free for "JETZT"
    if (h % 4 === 0 && x < 82) labels.push({ x, text: `${pad2(h)}:00` });
  }
  return (
    <div className="nx-wave">
      {labels.map((l) => <span key={l.text} className="lb" style={{ left: `${l.x}%` }}>{l.text}</span>)}
      <span className="lb now">JETZT</span>
      <svg viewBox={`0 0 ${W} 100`} preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="nxWp" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor={NX.orange} /><stop offset="1" stopColor="#ffe066" /></linearGradient>
          <linearGradient id="nxWc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={NX.violet} /><stop offset="1" stopColor={NX.magenta} /></linearGradient>
        </defs>
        {labels.map((l) => <line key={l.text} x1={(l.x / 100) * W} y1={0} x2={(l.x / 100) * W} y2={100} stroke="rgba(120,200,255,.12)" vectorEffect="non-scaling-stroke" />)}
        {prod.map((v, i) => {
          const h = v ? (v / maxP) * (axis - 4) : 0;
          return h > 0.5 ? <rect key={`p${i}`} x={i * pitch + 1} y={axis - h} width={pitch - 3} height={h} fill="url(#nxWp)" /> : null;
        })}
        {cons.map((v, i) => {
          const h = v ? (v / maxC) * (100 - axis - 8) : 0;
          return h > 0.5 ? <rect key={`c${i}`} x={i * pitch + 1} y={axis + 2} width={pitch - 3} height={h} fill="url(#nxWc)" opacity={0.85} /> : null;
        })}
        <line x1={0} y1={axis + 1} x2={W} y2={axis + 1} stroke={NX.cyan} strokeOpacity={0.6} vectorEffect="non-scaling-stroke" />
        <line x1={W - 1} y1={0} x2={W - 1} y2={100} stroke={NX.cyan} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

/** Energy: live flow plus the last 24 hours, with produced / consumed energy and self-sufficiency. */
export function EnergyStrip({ energy }: { energy: EnergyValues }) {
  const ids = useStore((s) => s.config?.energy?.states) ?? NO_STATES;
  const { data } = useHistory([ids.production, ids.consumption].filter(Boolean), 24, 120000);
  const now = useNow(60000);
  if (!energy.enabled) return null;
  const prod = bins(ids.production ? data[ids.production] : undefined, 96, 24, now);
  const cons = bins(ids.consumption ? data[ids.consumption] : undefined, 96, 24, now);
  const kwh = (b: (number | null)[]) => b.reduce<number>((s, v) => s + (v ?? 0) * 0.25, 0) / 1000;
  const hasWave = prod.some((v) => v != null) || cons.some((v) => v != null);
  const autarky = energy.autarky ?? (energy.home > 0 ? clamp((1 - Math.max(0, energy.grid) / energy.home) * 100, 0, 100) : 100);
  return (
    <Panel
      title="Energie"
      to="energy"
      right={
        <span className="nx-kpis">
          {prod.some((v) => v != null) && <span>ERZEUGT 24 H<b style={{ color: NX.amber }}>{num(kwh(prod), 1)} kWh</b></span>}
          {cons.some((v) => v != null) && <span>VERBRAUCHT<b style={{ color: '#c4a6ff' }}>{num(kwh(cons), 1)} kWh</b></span>}
          <span>AUTARKIE<b style={{ color: NX.cyan }}>{num(autarky, 0)} %</b></span>
        </span>
      }
    >
      <div className={`nx-ebody ${hasWave ? 'wave' : ''}`}>
        <FlowStrip e={energy} />
        {hasWave && <Waveform prod={prod} cons={cons} now={now} />}
      </div>
    </Panel>
  );
}
