/**
 * Radar page: live picture of the LD2410 presence radars at the wall displays (kiosk agents). While the page is
 * open and visible the server asks the agents for live frames, about four per second (see server kiosk.js);
 * agents before 1.3.0 only show their regular reports. The LD2410 measures distances, not directions: a target
 * is an arc across the radar's field of view, in engineering mode the energy of every distance gate is a ring band.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Radar as RadarIcon, TriangleAlert } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useStateValues, useStore, watchRadar, type RadarSample } from '../lib/store';
import { useNow } from '../lib/hooks';
import { timeAgo } from '../lib/format';
import { FOV, addTrail, arcPath, meters, metersShort, polar, radarAgentIds, radarRange, reportFrame, ringStep, sectorPath, type TrailPoint } from '../lib/radar';
import type { KioskAgent, RadarFrame, RadarTarget } from '../lib/types';
import { Empty, OpenSettingsButton, PageHeader, Panel, useStaticVisuals } from '../components/ui';
import { toneStyle } from '../components/Hud';
import { KioskSensorReadings, useKioskAgents } from '../components/KioskSensors';

/** Colours of the two kinds of target (radar, facts and gate bars) and of the presence limit. */
const MOVING = '#34d399';
const STILL = '#a78bfa';
const LIMIT = '#fbbf24';
/** A live frame older than this counts as gone (the agent sends about four per second). */
const LIVE_MS = 3000;
/** How long earlier target positions glow on. */
const TRAIL_MS = 2500;
/** Scope geometry in view box units: the sensor sits at the bottom centre and looks up. */
const W = 240;
const H = 142;
const CX = 120;
const CY = 128;
const R = 112;

/** Live frames while the page is open and visible: a hidden tab does not keep the agents streaming. */
function useRadarWatch() {
  useEffect(() => {
    let stop: (() => void) | null = null;
    const sync = () => {
      if (document.hidden) {
        stop?.();
        stop = null;
      } else {
        stop ??= watchRadar();
      }
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      stop?.();
    };
  }, []);
}

const targetText = (t: RadarTarget | null) => (t ? meters(t.distance) : '–');

/** Short description of the picture for screen readers. */
function describe(f: RadarFrame) {
  if (f.mode === 'none') return 'Radar: keine Daten';
  const parts = [f.moving && `Bewegung in ${meters(f.moving.distance)}`, f.still && `ruhende Person in ${meters(f.still.distance)}`].filter(Boolean);
  if (parts.length) return `Radar: ${parts.join(', ')}`;
  return f.presence ? 'Radar: Präsenz erkannt' : 'Radar: niemand da';
}

/** Arc of one target at its distance across the field of view, thicker with more energy; dimmed beyond the presence limit. */
function TargetArc({ target, color, rel, clip, dim }: { target: RadarTarget; color: string; rel: (cm: number) => number; clip: string; dim: boolean }) {
  const r = rel(target.distance) * R;
  const width = 1.6 + ((target.energy ?? 50) / 100) * 4;
  return (
    <g className="radar-arc" clipPath={`url(#${clip})`} fill="none" stroke={color} opacity={dim ? 0.45 : 1}>
      <circle cx={CX} cy={CY} r={r} strokeWidth={width * 3.2} strokeOpacity={0.18} />
      <circle cx={CX} cy={CY} r={r} strokeWidth={width} strokeOpacity={0.95} />
    </g>
  );
}

/** Distance of one target, on its arc (left for movement, right for a still person). */
function TargetLabel({ target, color, side, rel }: { target: RadarTarget; color: string; side: -1 | 1; rel: (cm: number) => number }) {
  const [x, y] = polar(CX, CY, R, rel(target.distance), side * 34);
  return (
    <g className="radar-label" style={{ transform: `translate(${x}px, ${y}px)` }}>
      <rect x={-14} y={-5.5} width={28} height={9} rx={4.5} fill="var(--bg)" fillOpacity={0.85} stroke={color} strokeWidth={0.5} />
      <text y={1.8} textAnchor="middle" fontSize={5.5} fontWeight={600} fill={color}>{meters(target.distance)}</text>
    </g>
  );
}

/** The scope: field of view with range rings, gate energies, presence limit, sweep, afterglow and the targets. */
function RadarScope({ frame, sample, limit }: { frame: RadarFrame; sample?: RadarSample; limit: number }) {
  const still = useStaticVisuals();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const clip = `${uid}-clip`;
  const range = radarRange(frame, limit);
  const rel = (cm: number) => Math.min(1, Math.max(0, cm / range));
  const step = ringStep(range);
  const rings = Array.from({ length: Math.floor(range / step) }, (_, i) => (i + 1) * step);
  // afterglow: the target distances of the last live frames
  const trail = useRef<TrailPoint[]>([]);
  if (!sample || still) trail.current = [];
  else if (trail.current.at(-1)?.at !== sample.at) trail.current = addTrail(trail.current, sample.at, sample.frame, TRAIL_MS);
  const gates = frame.gates;
  const gateCount = gates ? Math.max(gates.moving.length, gates.still.length) : 0;
  const targets: { key: string; target: RadarTarget; color: string; side: -1 | 1 }[] = [];
  if (frame.still) targets.push({ key: 'still', target: frame.still, color: STILL, side: 1 });
  if (frame.moving) targets.push({ key: 'moving', target: frame.moving, color: MOVING, side: -1 });
  const hasTargets = targets.length > 0;
  const message = frame.mode === 'none' ? 'Keine Daten' : hasTargets ? null : frame.presence ? 'Präsenz erkannt' : frame.presence === false ? 'Niemand da' : null;
  const wedge = sectorPath(CX, CY, R, 0, 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto max-h-[min(62vh,34rem)]" role="img" aria-label={describe(frame)}>
      <defs>
        <radialGradient id={`${uid}-bg`} cx={CX} cy={CY} r={R} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={MOVING} stopOpacity={0.16} />
          <stop offset="1" stopColor={MOVING} stopOpacity={0.03} />
        </radialGradient>
        <linearGradient id={`${uid}-beam`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={MOVING} stopOpacity={0} />
          <stop offset="0.5" stopColor={MOVING} stopOpacity={0.3} />
          <stop offset="1" stopColor={MOVING} stopOpacity={0} />
        </linearGradient>
        <clipPath id={clip}><path d={wedge} /></clipPath>
      </defs>

      <path d={wedge} fill={`url(#${uid}-bg)`} stroke={MOVING} strokeOpacity={0.35} strokeWidth={0.6} />
      {/* without distances (OUT pin) the whole field lights up while someone is there */}
      {!hasTargets && frame.presence && <path d={wedge} fill={MOVING} fillOpacity={0.2} className={still ? undefined : 'anim-breathe'} />}

      {gates && Array.from({ length: gateCount }, (_, i) => {
        const d = sectorPath(CX, CY, R, rel(i * frame.gateCm), rel((i + 1) * frame.gateCm));
        return (
          <g key={i}>
            <path className="radar-band" d={d} fill={MOVING} style={{ fillOpacity: ((gates.moving[i] ?? 0) / 100) * 0.5 }} />
            <path className="radar-band" d={d} fill={STILL} style={{ fillOpacity: ((gates.still[i] ?? 0) / 100) * 0.5 }} />
          </g>
        );
      })}

      <g className="text-muted" fill="none" stroke="currentColor" strokeOpacity={0.3} strokeWidth={0.5}>
        {rings.map((d) => <path key={d} d={arcPath(CX, CY, R, rel(d))} />)}
        {[-60, -30, 0, 30, 60].map((a) => {
          const [x, y] = polar(CX, CY, R, 1, a);
          return <line key={a} x1={CX} y1={CY} x2={x} y2={y} strokeDasharray={a % 60 ? '1.5 2.5' : undefined} />;
        })}
      </g>
      <g className="text-muted" fill="currentColor" fontSize={5.5}>
        {rings.map((d) => {
          const [x, y] = polar(CX, CY, R, rel(d), FOV);
          return <text key={d} x={x + 2.5} y={y + 2}>{meters(d, d % 100 ? 1 : 0)}</text>;
        })}
      </g>

      {limit > 0 && limit < range && (
        <g>
          <path d={sectorPath(CX, CY, R, rel(limit), 1)} fill="var(--bg)" fillOpacity={0.5} />
          <path d={arcPath(CX, CY, R, rel(limit))} fill="none" stroke={LIMIT} strokeWidth={0.8} strokeDasharray="3 2" />
          {(() => {
            const [x, y] = polar(CX, CY, R, rel(limit), -FOV);
            return <text x={x - 2.5} y={y + 2} textAnchor="end" fontSize={5.5} fill={LIMIT}>Grenze</text>;
          })()}
        </g>
      )}

      {!still && (
        <g clipPath={`url(#${clip})`}>
          <g className="radar-sweep" style={{ transformOrigin: `${CX}px ${CY}px` }}>
            <path d={sectorPath(CX, CY, R, 0, 1.02, -9, 9)} fill={`url(#${uid}-beam)`} />
          </g>
        </g>
      )}

      {sample && trail.current.slice(0, -1).map((p) => {
        const opacity = Math.max(0, 0.4 * (1 - (sample.at - p.at) / TRAIL_MS));
        return (
          <g key={p.at} fill="none" strokeWidth={1}>
            {p.moving !== null && <path d={arcPath(CX, CY, R, rel(p.moving))} stroke={MOVING} strokeOpacity={opacity} />}
            {p.still !== null && <path d={arcPath(CX, CY, R, rel(p.still))} stroke={STILL} strokeOpacity={opacity} />}
          </g>
        );
      })}

      {/* arcs first, so no arc covers the distance of the other target */}
      {targets.map(({ key, target, color }) => <TargetArc key={key} target={target} color={color} rel={rel} clip={clip} dim={limit > 0 && target.distance > limit} />)}
      {targets.map(({ key, target, color, side }) => <TargetLabel key={key} target={target} color={color} side={side} rel={rel} />)}

      {message && <text x={CX} y={CY - R * 0.55} textAnchor="middle" fontSize={8} fontWeight={600} className="text-muted" fill="currentColor">{message}</text>}

      <circle cx={CX} cy={CY} r={6} fill={MOVING} fillOpacity={0.2} className={still ? undefined : 'anim-breathe'} />
      <circle cx={CX} cy={CY} r={3.2} fill={MOVING} />
      <text x={CX} y={CY + 11} textAnchor="middle" fontSize={5} className="text-muted" fill="currentColor">LD2410</text>
    </svg>
  );
}

/** Coloured dot with a label (legend, facts). */
function Dot({ color, children }: { color?: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {color && <i className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />}
      {children}
    </span>
  );
}

/** Thin energy bar of a target (0–100). */
function EnergyBar({ value, color }: { value: number | null; color: string }) {
  if (value === null) return null;
  return (
    <div className="h-1 mt-1 rounded-full bg-[var(--track)] overflow-hidden" role="meter" aria-label="Energie" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
      <div className="radar-bar h-full rounded-full" style={{ width: `${value}%`, background: color }} />
    </div>
  );
}

/** Presence, both targets with their energy, the screen and the presence limit. */
function RadarFacts({ frame, screen, limit }: { frame: RadarFrame; screen: unknown; limit: number }) {
  const rows: { key: string; label: string; color?: string; value: string; energy?: number | null }[] = [
    { key: 'presence', label: 'Anwesenheit', color: frame.presence ? MOVING : undefined, value: frame.presence === null ? '–' : frame.presence ? 'Jemand da' : 'Niemand' },
    { key: 'moving', label: 'Bewegung', color: MOVING, value: targetText(frame.moving), energy: frame.moving?.energy ?? null },
    { key: 'still', label: 'Ruhend', color: STILL, value: targetText(frame.still), energy: frame.still?.energy ?? null },
    { key: 'screen', label: 'Display', value: typeof screen === 'boolean' ? (screen ? 'an' : 'aus') : '–' },
  ];
  if (limit > 0) rows.push({ key: 'limit', label: 'Grenze für Präsenz', color: LIMIT, value: meters(limit, limit % 100 ? 2 : 0) });
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-1 gap-x-4 gap-y-3">
      {rows.map((r) => (
        <div key={r.key} className="min-w-0">
          <dt className="text-[0.65rem] uppercase tracking-wider text-muted"><Dot color={r.color}>{r.label}</Dot></dt>
          <dd className="font-semibold tabular-nums truncate">{r.value}</dd>
          {r.energy !== undefined && <EnergyBar value={r.energy} color={r.color ?? MOVING} />}
        </div>
      ))}
    </dl>
  );
}

/** Energy of every distance gate as a pair of bars (engineering mode); gates beyond the presence limit are dimmed. */
function GateBars({ gates, gateCm, limit }: { gates: NonNullable<RadarFrame['gates']>; gateCm: number; limit: number }) {
  const count = Math.max(gates.moving.length, gates.still.length);
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <h3 className="section-title">Energie je Entfernungstor ({meters(gateCm)})</h3>
        <span className="flex gap-3 text-xs text-muted"><Dot color={MOVING}>Bewegung</Dot><Dot color={STILL}>Ruhend</Dot></span>
      </div>
      <div className="flex gap-1.5 h-24">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className={`flex-1 min-w-0 flex flex-col gap-1 ${limit > 0 && i * gateCm >= limit ? 'opacity-40' : ''}`}>
            <div className="relative flex-1 flex items-end gap-0.5 border-b border-line">
              <i className="radar-bar flex-1 rounded-t-sm" style={{ height: `${gates.moving[i] ?? 0}%`, background: MOVING }} />
              <i className="radar-bar flex-1 rounded-t-sm" style={{ height: `${gates.still[i] ?? 0}%`, background: STILL }} />
            </div>
            <span className="text-[0.62rem] text-muted text-center tabular-nums truncate">{metersShort(i * gateCm)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Live, waiting for the first frame, regular reports only or offline. */
function RadarStatus({ live, online, canLive }: { live: boolean; online: boolean; canLive: boolean }) {
  if (live) {
    return (
      <span className="chip on !cursor-default" style={toneStyle(MOVING)}>
        <i className="w-1.5 h-1.5 rounded-full bg-white anim-breathe" /> Live
      </span>
    );
  }
  return <span className="chip !cursor-default">{!online ? 'Offline' : canLive ? 'Verbinde …' : 'Meldungen'}</span>;
}

/** Radar of one wall display: live frames while they arrive, otherwise the regular reports. */
function RadarCard({ id, agent, limit, unavailable }: { id: string; agent?: KioskAgent; limit: number; unavailable: boolean }) {
  const sample = useStore((s) => s.radar[id]) as RadarSample | undefined;
  const p = `homeapp.kiosk.${id}.`;
  const report = useStateValues({ presence: `${p}presence`, moving: `${p}moving`, still: `${p}still`, distance: `${p}distance`, screen: `${p}screen`, online: `${p}online` });
  const now = useNow(1000);
  const live = sample !== undefined && now - sample.at < LIVE_MS;
  const frame = live ? sample.frame : reportFrame(report);
  const online = agent?.online ?? report.online !== false;
  const canLive = agent?.features?.includes('radar') ?? false;
  let hint: string | null = null;
  if (!online) hint = `Agent nicht erreichbar${agent ? ` (zuletzt ${timeAgo(agent.lastSeen)})` : ''}: Es gelten die letzten gemeldeten Werte.`;
  else if (agent && !canLive) hint = `Die Live-Ansicht braucht Kiosk-Agent 1.3.0 oder neuer (installiert: ${agent.version || 'unbekannt'}). Bis dahin zeigt das Radar die regelmäßigen Meldungen ohne Energiewerte.`;
  else if (frame.mode === 'pin') hint = 'Nur der OUT-Pin ist angeschlossen: Präsenz ohne Entfernung. Für das Radar TX/RX an die UART des Pi anschließen.';

  return (
    <Panel title={agent?.name ?? id} right={<RadarStatus live={live} online={online} canLive={canLive} />}>
      <div className="mb-5"><KioskSensorReadings agent={agent} unavailable={unavailable} /></div>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_13rem] items-center">
        <RadarScope frame={frame} sample={live ? sample : undefined} limit={limit} />
        <RadarFacts frame={frame} screen={report.screen} limit={limit} />
      </div>
      {frame.gates && <GateBars gates={frame.gates} gateCm={frame.gateCm} limit={limit} />}
      {frame.error && <p className="text-xs text-amber-400 mt-3 flex items-center gap-1.5"><TriangleAlert size={13} className="shrink-0" /> {frame.error}</p>}
      {hint && <p className="text-xs text-muted mt-3">{hint}</p>}
    </Panel>
  );
}

export function RadarView() {
  useRadarWatch();
  const { agents, error } = useKioskAgents();
  const ids = useStore(useShallow((s) => [...new Set([...radarAgentIds(s.states), ...Object.keys(s.radar)])].sort()));
  const limit = useStore((s) => s.config?.kiosk?.presenceMaxDistance ?? 0);

  return (
    <div>
      <PageHeader title="Radar" subtitle="Präsenzradar LD2410 an den Wanddisplays" />
      {error && <p role="status" className="text-sm text-amber-400 mb-4">{error}</p>}
      {ids.length === 0 ? (
        <Empty icon={<RadarIcon size={28} />} title="Kein Präsenzradar gemeldet" text="Sobald ein Kiosk-Agent mit LD2410 Werte meldet, erscheint sein Radar hier.">
          <OpenSettingsButton />
        </Empty>
      ) : (
        <>
          <div className={`grid gap-4 ${ids.length > 1 ? '2xl:grid-cols-2' : ''}`}>
            {ids.map((id) => <RadarCard key={id} id={id} agent={agents.find((a) => a.id === id)} limit={limit} unavailable={Boolean(error)} />)}
          </div>
          <p className="text-xs text-muted mt-4 max-w-3xl">
            Der LD2410 misst, wie weit ein Ziel entfernt ist, aber nicht, in welcher Richtung. Ziele erscheinen deshalb als Bogen über
            seinen Sichtbereich (±{FOV}°): <Dot color={MOVING}>Bewegung</Dot> und <Dot color={STILL}>ruhende Person</Dot> (Atmung, kleine
            Bewegungen); je dicker der Bogen, desto stärker das Signal. Die Ringe zeigen die Energie je Entfernungstor. Hinter der
            Grenze aus den Kiosk-Einstellungen zählt ein Ziel nicht als Anwesenheit.
          </p>
        </>
      )}
    </div>
  );
}
