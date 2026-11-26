/**
 * Robotic mower building blocks shared by the mower page and the device card: state chip, the command
 * buttons (ioBroker buttons such as `remote.start`, written through the server) and the live map – an SVG
 * with the mowed lanes of the session, the position and heading of the mower and the charging station,
 * drawn from the navimow adapter's track, frame and position datapoints.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { House, LoaderCircle, Pause, Play, StepForward, type LucideIcon } from 'lucide-react';
import { api } from '../lib/api';
import { useStateEntries, useStore } from '../lib/store';
import { EMPTY_DEVICES, useDevices } from '../lib/selectors';
import { clamp, toNum } from '../lib/format';
import {
  MOWER_COMMANDS, appendTail, gridStep, headingDeg, isDocked, isDriving, mapBounds, mapRotation, mowerActivity, mowerStatus, parseFrame, parsePoint,
  parseTrack, pathOf, projection, rotateBounds, rotatePoint, suggestedCommands, unwrapDeg, type MapPoint, type MowerActivity, type MowerCommand,
} from '../lib/mower';
import type { Device } from '../lib/types';
import { toneStyle } from './Hud';
import { useStaticVisuals } from './ui';

/** Colours of the map: mowed lanes, start point and charging station (the lines follow the theme, see styles/pages.css). */
export const MAP_COLORS = { swath: '#34d399', start: '#38bdf8', station: '#facc15' };

/** Finite number of a datapoint value, otherwise null. */
export const numOrNull = (v: unknown) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Timestamp in milliseconds (the adapter reports milliseconds; plain seconds are converted). */
export const msOrNull = (v: unknown) => {
  const n = numOrNull(v);
  return n === null || n <= 0 ? null : n < 1e12 ? n * 1000 : n;
};

/**
 * The first configured mower that is mowing right now (null otherwise) – the standard overview shows it in
 * place of the energy flow. Only the state datapoints are watched, so other values do not re-render.
 */
export function useActiveMower(): Device | null {
  const devices = useDevices();
  const mowers = useMemo(() => {
    const list = devices.filter((d) => d.type === 'mower' && d.states.state);
    return list.length ? list : EMPTY_DEVICES;
  }, [devices]);
  const ids = useMemo(() => mowers.map((m) => m.states.state), [mowers]);
  const states = useStateEntries(ids);
  return mowers.find((m) => mowerActivity(states[m.states.state]?.val) === 'mowing') ?? null;
}

/** Chip with the state of the mower in its colour; a dot breathes while it drives. */
export function MowerStateChip({ value, className = '' }: { value: unknown; className?: string }) {
  const s = mowerStatus(value);
  return (
    <span className={`chip on !cursor-default ${className}`} style={toneStyle(s.color)}>
      {isDriving(s.activity) && <i className="w-1.5 h-1.5 rounded-full bg-white anim-breathe" />}
      {s.label}
    </span>
  );
}

const COMMAND_ICONS: Record<MowerCommand, LucideIcon> = { start: Play, pause: Pause, resume: StepForward, home: House };

/**
 * Writes a button (or value) of the mower and reports the result as toast; `busy` is the key whose
 * command is on its way. The state follows later through the cloud, so nothing is changed optimistically.
 */
export function useMowerCommand(d: Device) {
  const toast = useStore((s) => s.toast);
  const [busy, setBusy] = useState<string | null>(null);
  const send = async (key: string, label: string, value: unknown = true) => {
    const id = d.states[key];
    if (!id || busy) return;
    setBusy(key);
    try {
      await api.setState(id, value);
      toast(`„${label}“ an ${d.name} gesendet`, 'success');
    } catch (err) {
      toast(`Befehl fehlgeschlagen: ${(err as Error).message}`, 'error');
    } finally {
      setBusy(null);
    }
  };
  return { busy, send };
}

/**
 * Start, pause, resume and "back to the station" (only the mapped ones, or those in `only`); the
 * commands that fit the state are highlighted. `compact`: one row of small buttons (device card);
 * `fill`: the buttons share the height of the surrounding flex column (bigger touch targets).
 */
export function MowerCommandButtons({ d, activity, compact = false, only, fill = false }: { d: Device; activity: MowerActivity; compact?: boolean; only?: MowerCommand[]; fill?: boolean }) {
  const { busy, send } = useMowerCommand(d);
  const suggested = suggestedCommands(activity);
  const list = MOWER_COMMANDS.filter((c) => d.states[c.key] && (!only || only.includes(c.key)));
  if (!list.length) return null;
  const size = compact ? 16 : 22;
  // full size: in a narrow panel (e.g. beside the state on a portrait wall display) the icon sits above the label
  const buttons = list.map((c) => {
    const CommandIcon = COMMAND_ICONS[c.key];
    return (
      <button
        key={c.key}
        type="button"
        className={`btn ${suggested.includes(c.key) ? 'primary' : ''} ${compact ? 'flex-1 !px-2 !py-2' : 'mower-cmd @max-xs:flex-col @max-xs:!gap-1 @max-xs:!px-2'}`}
        aria-busy={busy === c.key}
        onClick={(e) => {
          e.stopPropagation();
          send(c.key, c.label);
        }}
      >
        {busy === c.key ? <LoaderCircle size={size} className="anim-spin-fast anim-loader" aria-hidden /> : <CommandIcon size={size} aria-hidden />}
        <span>{c.label}</span>
      </button>
    );
  });
  if (compact) return <div className="flex gap-2">{buttons}</div>;
  return (
    <div className={`@container ${fill ? 'flex-1 min-h-0' : ''}`}>
      <div className={`grid grid-cols-2 gap-2.5 ${fill ? 'h-full auto-rows-fr' : ''}`}>{buttons}</div>
    </div>
  );
}

/** Live position of the mower from its datapoints (null while unknown). */
function livePosition(v: Record<string, unknown>): MapPoint | null {
  const x = numOrNull(v.x);
  const y = numOrNull(v.y);
  if (x === null || y === null) return null;
  const h = numOrNull(v.heading);
  return h === null ? { x, y } : { x, y, h };
}

/** True if the map has anything to show (track, frame, position or station). */
export function hasMapData(v: Record<string, unknown>) {
  return Boolean(parseTrack(v.track)?.points.length || parseFrame(v.frame) || livePosition(v) || parsePoint(v.station));
}

/**
 * Live map of the mower: grid in metres, mowed lanes as wide translucent band (the cutting width of the
 * options), the driven line on top with the latest stretch highlighted, the start of the session, the
 * charging station and the mower turned to its heading. Positions that arrive between two track updates
 * of the adapter are appended, so the line follows the mower. `values` are the datapoint values of `d`.
 */
export function MowerMap({ d, values, className = '' }: { d: Device; values: Record<string, unknown>; className?: string }) {
  const still = useStaticVisuals();
  const rot = mapRotation(d.options.rotate);
  const cut = clamp(toNum(d.options.cutWidth, 20), 5, 80) / 100;
  const status = mowerStatus(values.state);
  const driving = isDriving(status.activity);
  const track = useMemo(() => parseTrack(values.track), [values.track]);
  const frame = useMemo(() => parseFrame(values.frame), [values.frame]);
  const station = useMemo(() => parsePoint(values.station), [values.station]);
  const live = livePosition(values);

  // positions since the adapter last wrote its track
  const [tail, setTail] = useState<MapPoint[]>([]);
  useEffect(() => setTail([]), [values.track]);
  useEffect(() => {
    if (live && driving) setTail((t) => appendTail(t, live));
  }, [live?.x, live?.y]);

  // everything in map orientation; the track part is the expensive one and only changes with the track
  const turned = useMemo(() => (track?.points ?? []).map((p) => rotatePoint(p, rot)), [track, rot]);
  const base = useMemo(() => mapBounds(frame ? rotateBounds(frame, rot) : null, turned), [frame, turned, rot]);
  const tailT = tail.map((p) => rotatePoint(p, rot));
  const mowerRaw = live ?? (isDocked(status.activity) ? station : null) ?? track?.points.at(-1) ?? null;
  const mower = mowerRaw && rotatePoint(mowerRaw, rot);
  const stationT = station && rotatePoint(station, rot);
  const bounds = mapBounds(base, [...tailT, ...(mower ? [mower] : []), ...(stationT ? [stationT] : [])]);
  const pr = useMemo(() => (bounds ? projection(bounds) : null), [bounds?.minX, bounds?.maxX, bounds?.minY, bounds?.maxY]);
  const trackPath = useMemo(() => (pr ? pathOf(turned, pr.at) : ''), [turned, pr]);

  // heading of the symbol: shortest turn from the previous angle, so it never spins the long way round
  const degRef = useRef<number | null>(null);
  if (mower?.h !== undefined) degRef.current = unwrapDeg(degRef.current ?? headingDeg(mower.h), headingDeg(mower.h));

  if (!bounds || !pr) return null;
  const { width: W, height: H, scale: S, at } = pr;
  const step = gridStep(Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY));
  const lines: { key: string; x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let gx = Math.ceil(bounds.minX / step) * step; gx <= bounds.maxX; gx += step) lines.push({ key: `x${gx}`, x1: (gx - bounds.minX) * S, y1: 0, x2: (gx - bounds.minX) * S, y2: H });
  for (let gy = Math.ceil(bounds.minY / step) * step; gy <= bounds.maxY; gy += step) lines.push({ key: `y${gy}`, x1: 0, y1: (bounds.maxY - gy) * S, x2: W, y2: (bounds.maxY - gy) * S });

  // the band and the line run on to the mower while it drives
  const lead = [...tailT, ...(driving && mower ? [mower] : [])];
  const leadPath = lead.length ? pathOf(lead, at) : '';
  const fullPath = trackPath && leadPath ? `${trackPath}${leadPath.replace(/^M/, 'L')}` : trackPath || leadPath;
  const recent = [...turned.slice(-6), ...lead];
  const start = turned[0] ?? tailT[0];
  const L = Math.max(0.55 * S, 30);
  const w = L * 0.72;
  const st = Math.max(0.5 * S, 28);
  const [mx, my] = mower ? at(mower) : [0, 0];
  const bar = step * S;
  const stationNode = stationT && (
    <g transform={`translate(${at(stationT)[0].toFixed(1)} ${at(stationT)[1].toFixed(1)})`} aria-label="Ladestation">
      <rect x={-st / 2} y={-st / 2} width={st} height={st} rx={st * 0.26} fill={MAP_COLORS.station} fillOpacity="0.18" stroke={MAP_COLORS.station} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <path d={`M${st * 0.06} ${-st * 0.34}L${-st * 0.2} ${st * 0.05}H${0}L${-st * 0.06} ${st * 0.34}L${st * 0.2} ${-st * 0.05}H${0}Z`} fill={MAP_COLORS.station} />
    </g>
  );
  // a docked mower sits on its station: the station is drawn on top, so the charging symbol stays visible
  const docked = isDocked(status.activity);

  return (
    <svg
      viewBox={`0 0 ${W.toFixed(1)} ${H.toFixed(1)}`}
      className={`mower-map ${className}`}
      style={{ aspectRatio: `${W} / ${H}` }}
      role="img"
      aria-label={`Karte von ${d.name}: ${status.label}`}
    >
      <g stroke="var(--line)" strokeWidth="1" vectorEffect="non-scaling-stroke">
        {lines.map((l) => <line key={l.key} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} vectorEffect="non-scaling-stroke" />)}
      </g>
      {fullPath && (
        <>
          <path d={fullPath} fill="none" stroke={MAP_COLORS.swath} strokeOpacity="0.3" strokeWidth={Math.max(cut * S, 4)} strokeLinecap="round" strokeLinejoin="round" />
          <path d={fullPath} fill="none" stroke="var(--mower-line)" strokeOpacity="0.55" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </>
      )}
      {recent.length > 1 && (
        <path d={pathOf(recent, at)} fill="none" stroke="var(--mower-recent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" className="mower-recent" />
      )}
      {start && <circle cx={at(start)[0]} cy={at(start)[1]} r={Math.max(0.12 * S, 7)} fill={MAP_COLORS.start} stroke="#fff" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
      {!docked && stationNode}
      {mower && (
        <g
          className={`mower-bot ${still ? '' : 'mower-glide'}`}
          style={{ transform: `translate(${mx.toFixed(1)}px, ${my.toFixed(1)}px) rotate(${(degRef.current ?? 0).toFixed(1)}deg)` }}
        >
          {driving && <circle r={L * 0.8} fill={status.color} fillOpacity="0.35" className="mower-ping" />}
          <rect x={-L / 2} y={-w / 2} width={L} height={w} rx={w * 0.34} fill={status.color} stroke="#fff" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          <path d={`M${L * 0.08} ${-w * 0.26}L${L * 0.36} 0L${L * 0.08} ${w * 0.26}Z`} fill="#fff" />
        </g>
      )}
      {docked && stationNode}
      {/* scale bar in the lower left corner */}
      <g transform={`translate(${20} ${(H - 22).toFixed(1)})`} className="mower-scale">
        <path d={`M0 -8V0H${bar.toFixed(1)}V-8`} fill="none" stroke="var(--fg)" strokeOpacity="0.7" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <text x={bar / 2} y={-12} textAnchor="middle" fontSize="22" fill="var(--fg)" fillOpacity="0.75">{step} m</text>
      </g>
    </svg>
  );
}
