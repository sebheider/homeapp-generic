/**
 * Overview page ("Übersicht") as a futuristic command centre:
 *   - hero: clock, greeting and status chips | "Home Core" showing the state of the house | weather with the
 *     UV index and its forecast
 *   - while a 3D print runs: webcam, progress and remaining time (kiosk: a one-row strip)
 *   - while music plays (Spotify): a mini player with all controls (kiosk: a one-row strip)
 *   - live gauges: battery, lights, heat pump (the own start page offers the other gauges as widgets)
 *   - energy flow with a 24 h curve – while a robotic mower mows, its live map in that place – and
 *     security (cameras, activity timeline, doors / windows)
 *   - a matrix of all rooms, the scenes and the lights that are on
 * Every panel leads to its detail page; those stay plain and functional.
 * In kiosk mode (permanent screen, see lib/display.ts) a compact variant fills exactly one screen –
 * side by side on landscape screens, stacked on portrait screens (e.g. 1200×1920).
 * The data of the overview designs comes from lib/overview.ts; the optional "Nexus" design lives
 * in NexusDashboard.tsx, the freely designable start page ("Eigene") in CustomDashboard.tsx – its
 * widgets reuse the panels exported here.
 */
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Activity, AirVent, ArrowRight, BatteryCharging, BatteryFull, BatteryLow, BatteryMedium, BatteryWarning, Camera, DoorClosed, DoorOpen, Droplets, Fan, Flame, LayoutGrid, Leaf, Lightbulb, Music, Power, Printer3d, Sun, Sunrise, Sunset, Thermometer, Trash2, Wind, Zap } from 'lucide-react';
import { useStateValues, useStore, type View } from '../lib/store';
import { HEATPUMP_IDLE_W, heatPumpRunning, heatPumpState, heatPumpWatts } from '../lib/heatpump';
import { Icon, LawnMower } from '../lib/icons';
import { clamp, clockTime, greeting, num, powerText, timeAgo, toNum } from '../lib/format';
import { switchAllOff } from '../lib/selectors';
import { describeCode, fmtTime, useLocalWeather, useWeatherData, uvLevel, uvOutlook } from '../lib/weather';
import type { WeatherData } from '../lib/api';
import { areaText, mowerStatus, parseTrack } from '../lib/mower';
import { useElementSize, useNow } from '../lib/hooks';
import { useKioskLayout, usePortrait } from '../lib/display';
import { useOverview, type Overview, type RoomSummary } from '../lib/overview';
import { DeviceTiles } from '../components/DeviceCards';
import { EnergyFlow, energyFlowHeight, useEnergy, IDLE_W, type EnergyValues } from '../components/Energy';
import { KIND_STYLE, KindIcon, SnapshotImage, motionKey, useRecentMotion } from '../components/Cameras';
import { PrinterPanel, PrinterStrip, usePrintOnOverview } from '../components/Printer';
import { SpotifyPanel, SpotifyStrip, useSpotifyOnDashboard } from '../components/Spotify';
import { MowerMap, hasMapData, numOrNull, useActiveMower } from '../components/Mower';
import { KioskSensorsPanel } from '../components/KioskSensors';
import { duration, percent, printerStatus } from '../lib/printer';
import { daysUntil, nextPickup, pickupText } from '../lib/waste';
import { roomsToVentilate, ventilateText } from '../lib/ventilation';
import { AreaChart, useHistory, type ChartSeries } from '../components/Charts';
import { WeatherIcon } from '../components/WeatherIcon';
import { particles, precipitation } from '../lib/ambience';
import { useNotifications } from '../components/Notifications';
import { AnimatedNumber, ArcGauge, FitBox, HomeCore, HudPanel, LiquidGauge, SegmentRing, toneStyle } from '../components/Hud';
import { Empty, Loading, OpenSettingsButton, Rise, Stagger } from '../components/ui';
import { MOTION_LABEL, type CameraInfo, type Device, type MotionEvent } from '../lib/types';

// the optional "Nexus" design is only loaded when this device uses it
const NexusDashboard = lazy(() => import('./NexusDashboard').then((m) => ({ default: m.NexusDashboard })));
// the same for the freely designable start page
const CustomDashboard = lazy(() => import('./CustomDashboard').then((m) => ({ default: m.CustomDashboard })));

/** Accent colours of the overview. */
export const C = {
  cyan: '#22d3ee',
  violet: '#a78bfa',
  amber: '#fbbf24',
  solar: '#facc15',
  green: '#34d399',
  heat: '#fb7185',
  warm: '#fb923c',
  alert: '#f43f5e',
};

const NO_STATES: Record<string, string> = {};

/* ------------------------------------------------------------------ hero */

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Big digital clock with blinking colon and a bar that fills up during the minute. `compact`: smaller
 * (widgets); `large`: as big as the kiosk hero allows, readable from across the room.
 */
export function HeroClock({ compact = false, large = false }: { compact?: boolean; large?: boolean }) {
  const d = new Date(useNow(1000));
  const s = d.getSeconds();
  const size = large ? 'text-[5.75rem]' : compact ? 'text-[3.6rem]' : 'text-6xl sm:text-7xl';
  const secSize = large ? 'text-3xl' : compact ? 'text-xl' : 'text-xl sm:text-2xl';
  return (
    <div>
      <div className={`hud-clock font-bold leading-none hud-glow-text ${size}`}>
        {pad(d.getHours())}
        <span className="hud-colon">:</span>
        {pad(d.getMinutes())}
        <span className={`${secSize} text-muted font-semibold ml-2 align-top`}>{pad(s)}</span>
      </div>
      <div className={`${compact && !large ? 'mt-2' : 'mt-3'} ${large ? 'h-1 max-w-[24rem]' : 'h-[3px] max-w-[18rem]'} w-full rounded-full bg-[var(--track)] overflow-hidden`}>
        {/* no transition when the minute starts over, otherwise the bar would run backwards */}
        <div className="h-full rounded-full" style={{ width: `${((s + 1) / 60) * 100}%`, background: 'var(--tone)', boxShadow: '0 0 10px var(--tone)', transition: s === 0 ? 'none' : 'width 1s linear' }} />
      </div>
    </div>
  );
}

/**
 * Small glowing chips with the most important facts; each one leads to its page (`max` limits their number).
 * `strips`: print and music have strips of their own (kiosk overview), so they get no chip.
 */
export function StatusChips({ o, energy, max, strips = false }: { o: Overview; energy: EnergyValues; max?: number; strips?: boolean }) {
  const setView = useStore((s) => s.setView);
  const cams = useStore((s) => s.cameras.length);
  const camsOnline = useStore((s) => Boolean(s.status?.surveillance.connected));
  const last = useStore((s) => s.motion[0]) as MotionEvent | undefined;
  const now = useNow(30000);
  // running 3D print: primitive selections, so the chips do not re-render on every temperature change
  const printing = usePrintOnOverview();
  const printPct = useStore((s) => percent(s.printer));
  const printLeft = useStore((s) => (s.printer?.progress?.printTimeLeft == null ? null : Math.round(s.printer.progress.printTimeLeft / 60) * 60));
  const printColor = useStore((s) => printerStatus(s.printer).color);
  const music = useSpotifyOnDashboard();
  const musicTitle = useStore((s) => (s.spotify?.track ? `${s.spotify.track.name} – ${s.spotify.track.artists}` : null));
  const musicPlaying = useStore((s) => Boolean(s.spotify?.playing));
  const showNotifications = useStore((s) => s.showNotifications);
  // waste pickup today / tomorrow / the day after, and rooms that should be aired (both only change with a server push)
  const waste = useStore((s) => s.waste);
  const ventilation = useStore((s) => s.ventilation);
  const nextWaste = waste?.enabled ? nextPickup(waste.upcoming, new Date(now)) : null;
  const wasteIn = nextWaste ? daysUntil(nextWaste.date, new Date(now)) : Infinity;
  const airRooms = ventilation?.enabled ? roomsToVentilate(ventilation.rooms) : [];
  const chips: { key: string; color: string; icon: ReactNode; text: string; view: View; room?: string | null; onClick?: () => void }[] = [];
  if (o.openContacts.length) {
    const names = o.openContacts.map((d) => d.name).slice(0, 2).join(', ');
    chips.push({ key: 'open', color: C.alert, icon: <DoorOpen size={13} />, text: `${names} offen`, view: 'rooms' });
  }
  if (nextWaste && wasteIn <= 2) {
    chips.push({ key: 'waste', color: wasteIn <= 1 ? C.amber : '#a3e635', icon: <Trash2 size={13} />, text: pickupText(nextWaste, new Date(now)), view: 'home', onClick: () => showNotifications(true) });
  }
  if (airRooms.length) {
    const room = airRooms.length === 1 ? airRooms[0].room : null;
    chips.push({ key: 'vent', color: airRooms[0].severity === 'warning' ? C.alert : C.cyan, icon: <AirVent size={13} />, text: ventilateText(airRooms), view: 'rooms', room });
  }
  if (printing && !strips) {
    chips.push({ key: 'printer', color: printColor, icon: <Printer3d size={13} />, text: `3D-Druck ${printPct ?? '–'} %${printLeft != null ? ` · noch ${duration(printLeft)}` : ''}`, view: 'printer' });
  }
  if (music && musicTitle && !strips) {
    const title = musicTitle.length > 42 ? `${musicTitle.slice(0, 41)}…` : musicTitle;
    chips.push({ key: 'music', color: '#1ed760', icon: <Music size={13} />, text: musicPlaying ? title : `Pausiert: ${title}`, view: 'spotify' });
  }
  if (o.lights.length) {
    const n = o.lightsOn.length;
    chips.push({ key: 'lights', color: C.amber, icon: <Lightbulb size={13} />, text: n ? `${n} ${n === 1 ? 'Licht' : 'Lichter'} an` : 'Alle Lichter aus', view: 'lights' });
  }
  if (o.heatingRooms) chips.push({ key: 'heat', color: C.heat, icon: <Flame size={13} />, text: `Heizt in ${o.heatingRooms} ${o.heatingRooms === 1 ? 'Raum' : 'Räumen'}`, view: 'climate' });
  if (energy.enabled && energy.pv > IDLE_W) chips.push({ key: 'pv', color: C.solar, icon: <Sun size={13} />, text: `${powerText(energy.pv)} Solar`, view: 'energy' });
  if (cams) chips.push({ key: 'cams', color: C.violet, icon: <Camera size={13} />, text: `${cams} ${cams === 1 ? 'Kamera' : 'Kameras'} ${camsOnline ? 'online' : 'offline'}`, view: 'cameras' });
  if (last && now - last.ts < 10 * 60e3) {
    chips.push({ key: 'motion', color: KIND_STYLE[last.kind].color, icon: <KindIcon kind={last.kind} size={13} />, text: `${MOTION_LABEL[last.kind]}: ${last.name} ${timeAgo(last.ts)}`, view: 'cameras' });
  }
  return (
    <div className={`flex flex-wrap gap-2 ${max ? 'mt-3' : 'mt-4'}`}>
      {chips.slice(0, max).map((c) => (
        <button key={c.key} className="hud-chip hover:brightness-125 transition" style={toneStyle(c.color)} onClick={c.onClick ?? (() => setView(c.view, c.room))}>
          {c.icon}
          {c.text}
        </button>
      ))}
    </div>
  );
}

/**
 * UV index and its forecast in one line: current value in its level colour, a bar per coming hour (after
 * sunset the hours of tomorrow) and the peak. Fits next to the sun times, so the weather block keeps its height.
 * `detail` drops parts where the line has no room: 0 everything, 1 without the peak, 2 without the bars.
 */
function HeroUv({ web, large, detail = 0 }: { web: WeatherData; large: boolean; detail?: number }) {
  const outlook = uvOutlook(web, Date.now() / 1000, 12);
  if (!outlook) return null;
  const { now, shown, tomorrow, peak } = outlook;
  const level = uvLevel(now);
  const max = Math.max(3, peak?.uv ?? 0);
  const peakText = peak && (peak.uv ?? 0) >= 0.5 ? `${tomorrow ? 'morgen ' : ''}max. ${num(peak.uv ?? 0, 0)}` : null;
  const title = [
    `UV-Index ${num(now, 1)} (${level.label})`,
    peak && (peak.uv ?? 0) >= 0.5 ? `${tomorrow ? 'morgen' : 'heute'} max. ${num(peak.uv ?? 0, 1)} um ${fmtTime(peak.t, web.timezone)} Uhr` : null,
  ].filter(Boolean).join(' · ');
  return (
    <span className="hero-uv inline-flex items-center gap-1.5 whitespace-nowrap" title={title} aria-label={title}>
      <Sun size={large ? 16 : 12} style={{ color: level.color }} />
      <span>UV <b className="tabular-nums" style={{ color: level.color }}>{num(now, 0)}</b></span>
      {shown.length > 1 && detail < 2 && (
        <span className={`hero-uv-bars ${large ? 'large' : ''}`} aria-hidden>
          {shown.map((h) => (
            <i key={h.t} style={{ height: `${Math.max(8, clamp((h.uv ?? 0) / max, 0, 1) * 100)}%`, background: uvLevel(h.uv).color, opacity: (h.uv ?? 0) >= 0.5 ? 0.9 : 0.35 }} />
          ))}
        </span>
      )}
      {peakText && detail < 1 && <span className="tabular-nums">{peakText}</span>}
    </span>
  );
}

/**
 * Outside conditions: local station first, internet forecast for everything else. `large`: kiosk hero;
 * `uv`: UV index with its forecast beside the sun times (standard overview).
 */
export function HeroWeather({ fallback, compact = false, large = false, uv = false }: { fallback: number | null; compact?: boolean; large?: boolean; uv?: boolean }) {
  const enabled = useStore((s) => s.config?.weather?.enabled !== false);
  const setView = useStore((s) => s.setView);
  const { data } = useWeatherData();
  const local = useLocalWeather();
  // the UV line must neither widen the weather block (it would slide under the Home Core on narrow kiosk heroes)
  // nor make the hero taller. Steps, measured before painting and again after resizing / new data: 0–2 beside the
  // sun times (all, without the peak, without the bars), 3–5 the same beside the small "Außen" heading (narrow
  // portrait heroes), 6 hidden.
  const sunRow = useRef<HTMLDivElement>(null);
  const labelRow = useRef<HTMLDivElement>(null);
  const [uvStep, setUvStep] = useState(0);
  useLayoutEffect(() => {
    if (!uv || uvStep >= 6) return;
    const row = uvStep < 3 ? sunRow.current : labelRow.current;
    if (row && row.scrollWidth > row.clientWidth + 1) setUvStep(uvStep + 1);
  });
  useEffect(() => {
    if (!uv) return;
    const reset = () => setUvStep(0);
    window.addEventListener('resize', reset);
    return () => window.removeEventListener('resize', reset);
  }, [uv]);
  const fetchedAt = data?.fetchedAt;
  useEffect(() => setUvStep(0), [fetchedAt]);
  const web = data?.configured ? data : null;
  const cur = web?.current;
  const temp = local.temperature ?? cur?.temp ?? fallback;
  const iconSize = large ? 112 : compact ? 68 : 88;
  if (temp == null && !cur) return <div className="hidden lg:block" />;
  const cond = describeCode(cur?.code);
  const today = web?.daily[0];
  const humidity = local.humidity ?? cur?.humidity ?? null;
  const wind = local.windSpeed ?? cur?.wind ?? null;
  const detail = large ? 'text-base gap-x-4' : 'text-xs gap-x-3';
  const icon = large ? 16 : 12;
  return (
    <button className={`flex items-center ${large ? 'gap-5' : 'gap-4'} text-left lg:justify-self-end ${uv ? 'min-w-0 max-w-full' : ''}`} style={toneStyle(cond.tone)} onClick={() => enabled && setView('weather')}>
      {/* explicit size in rem: the zoom of the scaled kiosk does not count when the grid measures the content */}
      {cur && <div className="shrink-0" style={{ width: `${iconSize / 16}rem`, height: `${iconSize / 16}rem` }}><WeatherIcon kind={cond.kind} isDay={cur.isDay} size={iconSize} code={cur.code} wind={wind} /></div>}
      <div className="min-w-0">
        <div ref={labelRow} className={`${large ? 'text-sm' : 'text-[0.68rem]'} text-muted flex items-center gap-3`}>
          <span className="uppercase tracking-[0.22em]">Außen</span>
          {web && uv && uvStep >= 3 && uvStep < 6 && <HeroUv web={web} large={false} detail={uvStep - 3} />}
        </div>
        <div className={`${large ? 'text-[4.25rem]' : compact ? 'text-[2.6rem]' : 'text-5xl'} font-bold leading-none hud-glow-text tracking-tight`}>
          {temp == null ? '–' : <AnimatedNumber value={temp} digits={1} />}
          <span className={`${large ? 'text-3xl' : 'text-xl'} text-muted font-semibold`}>°C</span>
        </div>
        {cur && <div className={`${large ? 'text-xl mt-2' : 'text-sm mt-1.5'} font-medium`}>{cond.label}</div>}
        <div className={`${detail} text-muted mt-1 flex flex-wrap gap-y-1`}>
          {today?.tMax != null && today.tMin != null && <span>↑ {num(today.tMax, 0)}° ↓ {num(today.tMin, 0)}°</span>}
          {humidity != null && <span className="inline-flex items-center gap-1"><Droplets size={icon} /> {num(humidity, 0)} %</span>}
          {wind != null && <span className="inline-flex items-center gap-1"><Wind size={icon} /> {num(wind, 0)} km/h</span>}
        </div>
        {web && ((today?.sunrise != null && today.sunset != null) || uv) && (
          <div ref={sunRow} className={`${detail} text-muted mt-1 flex items-center`}>
            {today?.sunrise != null && today.sunset != null && (
              <>
                <span className="inline-flex items-center gap-1"><Sunrise size={icon} /> {fmtTime(today.sunrise, web.timezone)}</span>
                <span className="inline-flex items-center gap-1"><Sunset size={icon} /> {fmtTime(today.sunset, web.timezone)}</span>
              </>
            )}
            {uv && uvStep < 3 && <HeroUv web={web} large={large} detail={uvStep} />}
          </div>
        )}
      </div>
    </button>
  );
}

/** State of the house from the notifications: colour, label and number of messages. */
export function useHouseState() {
  const { visible, open, top } = useNotifications();
  const state = open.length || top === 'alarm' ? 'alarm' : top === 'warning' ? 'warning' : 'ok';
  const color = state === 'alarm' ? C.alert : state === 'warning' ? C.warm : C.cyan;
  const label = state === 'alarm' ? 'Alarm' : state === 'warning' ? 'Warnung' : 'System OK';
  const sub = visible.length ? `${visible.length} ${visible.length === 1 ? 'Meldung' : 'Meldungen'}` : 'Alles im grünen Bereich';
  return { color, label, sub };
}

/** Home Core showing the state of the house; a click opens the notifications. */
export function HouseCore({ size }: { size?: string }) {
  const { color, label, sub } = useHouseState();
  const show = useStore((s) => s.showNotifications);
  return (
    <button className="justify-self-center rounded-full" onClick={() => show(true)} aria-label={`Hausstatus: ${label} – Benachrichtigungen öffnen`}>
      <HomeCore color={color} label={label} sub={sub} size={size} />
    </button>
  );
}

/**
 * Top panel: clock and status | Home Core (state of the house, opens the notifications) | weather.
 * `portrait` (kiosk in portrait format): narrower columns, the status chips below the clock.
 */
/** Rain or snow falling through the hero panel while it rains or snows outside (effects level 'high' only). */
function HeroPrecip() {
  const high = useStore((s) => s.display.effects === 'high');
  const w = useWeatherData().data;
  const code = w?.configured ? w.current.code : undefined;
  const kind = precipitation(describeCode(code).kind);
  if (!high || !kind) return null;
  return (
    <div className={`hero-precip ${kind}`} aria-hidden>
      {particles(kind === 'rain' ? 26 : 18, kind).map((p, i) => (
        <i key={i} style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s` }} />
      ))}
    </div>
  );
}

function HeroPanel({ o, energy, compact = false, portrait = false }: { o: Overview; energy: EnergyValues; compact?: boolean; portrait?: boolean }) {
  const { color } = useHouseState();
  const today = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  if (portrait) {
    return (
      <HudPanel color={color} edge>
        <HeroPrecip />
        <div className="relative grid items-center gap-3 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <div className="min-w-0">
            <HeroClock large />
            <p className="text-base mt-2 leading-snug">
              <b>{greeting()}</b> <span className="text-muted capitalize">· {today}</span>
            </p>
            <StatusChips o={o} energy={energy} max={3} strips />
          </div>
          <HouseCore size="min(8.5rem, 11vh)" />
          <HeroWeather fallback={o.outside} compact large uv />
        </div>
        <KioskSensorsPanel compact embedded />
      </HudPanel>
    );
  }
  return (
    <HudPanel color={color} className={compact ? '' : 'sm:!p-6'} edge>
      <HeroPrecip />
      <div className={`relative grid items-center ${compact ? 'gap-4 grid-cols-[1fr_auto_1fr]' : 'gap-6 lg:grid-cols-[1fr_auto_1fr]'}`}>
        <div className="min-w-0">
          <HeroClock compact={compact} large={compact} />
          {compact ? (
            <p className="text-base mt-2 truncate">
              <b>{greeting()}</b> <span className="text-muted capitalize">· {today}</span>
            </p>
          ) : (
            <>
              <p className="text-muted text-sm mt-4 capitalize">{today}</p>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{greeting()}</h1>
            </>
          )}
          <StatusChips o={o} energy={energy} max={compact ? 3 : undefined} strips={compact} />
        </div>
        <HouseCore size={compact ? 'min(9.5rem, 20vh)' : undefined} />
        <HeroWeather fallback={o.outside} compact={compact} large={compact} uv />
      </div>
      <KioskSensorsPanel compact={compact} embedded />
    </HudPanel>
  );
}

/* ------------------------------------------------------------------ gauges */

/** Panel of one gauge with an icon before its title; in the compact (kiosk) layout it fills its grid cell and centres the gauge. */
export function GaugeTile({ title, icon, color, onClick, compact, children }: { title: ReactNode; icon?: ReactNode; color: string; onClick: () => void; compact?: boolean; children: ReactNode }) {
  return (
    <HudPanel
      title={icon ? <span className="inline-flex items-center gap-1.5">{icon}{title}</span> : title}
      color={color}
      onClick={onClick}
      className={compact ? 'h-full min-h-0 flex flex-col' : ''}
      bodyClassName={compact ? 'flex-1 min-h-0 flex items-center justify-center' : ''}
    >
      {children}
    </HudPanel>
  );
}

/** Battery symbol for the charge state (while charging: with a flash). */
function BatteryIcon({ soc, charging }: { soc: number | null; charging: boolean }) {
  const Shape = charging ? BatteryCharging : soc == null || soc >= 75 ? BatteryFull : soc >= 35 ? BatteryMedium : soc >= 10 ? BatteryLow : BatteryWarning;
  return <Shape size={13} />;
}

/**
 * Heat pump: COP as arc (or the flow temperature if there is no COP datapoint). While the compressor runs
 * the fan turns (in the title and large inside the ring) and the caption shows the electrical draw.
 */
function HeatPumpGauge({ d, compact }: { d: Device; compact?: boolean }) {
  const v = useStateValues(d.states ?? NO_STATES);
  const setView = useStore((s) => s.setView);
  const cop = v.cop != null ? toNum(v.cop) : null;
  const flow = v.flowTemp != null ? toNum(v.flowTemp) : null;
  const running = heatPumpRunning(d, v);
  const watts = d.states?.electricPower ? heatPumpWatts(d, v.electricPower) : null;
  const draw = watts != null && (running || watts > HEATPUMP_IDLE_W) ? (
    <span className="gauge-em"><Zap size={12} className="shrink-0" style={{ color: C.solar }} />{powerText(watts)}</span>
  ) : null;
  const state = running ? 'läuft' : heatPumpState(d, v, running);
  const parts: (string | null)[] = cop != null ? [state, flow != null ? `VL ${num(flow, 0)} °C` : null] : ['Vorlauf', state];
  const text = parts.filter(Boolean).join(' · ');
  const fan = <Fan size={13} className={running ? 'anim-spin-fast' : ''} />;
  const backdrop = running ? <Fan strokeWidth={1.25} className="anim-spin" style={{ color: C.warm, opacity: 0.28, animationDuration: '1.6s' }} /> : undefined;
  // the draw comes first: a one-line caption (narrow panels) cuts off the end
  const label = <>{draw && <>{draw}<span className="gauge-sep"> · </span></>}{text}</>;
  return (
    <GaugeTile title="Wärmepumpe" icon={fan} color={C.warm} onClick={() => setView('climate')} compact={compact}>
      {cop != null ? (
        <ArcGauge value={cop} max={6} digits={1} unit="COP" colors={['#f97316', C.solar]} label={label} backdrop={backdrop} />
      ) : (
        <ArcGauge value={flow} min={20} max={60} digits={1} unit="°C" colors={['#f97316', C.heat]} label={label} backdrop={backdrop} />
      )}
    </GaugeTile>
  );
}

/**
 * Panels of the live gauges; only what the installation has. Their keys name the gauge ("solar",
 * "battery", "autarky", "climate", "lights", "heatpump"). `compact`: the panel fills its area.
 */
export function useGaugeTiles(o: Overview, energy: EnergyValues, compact = false): ReactElement[] {
  const setView = useStore((s) => s.setView);
  const tiles: ReactElement[] = [];
  if (energy.enabled) {
    const kw = energy.pv / 1000;
    // scale in steps of 5 kW that leaves some head room
    const max = Math.max(5, Math.ceil((kw * 1.15) / 5) * 5);
    tiles.push(
      <GaugeTile
        key="solar"
        title="Solar"
        icon={<Sun size={13} className={energy.pv > IDLE_W ? 'anim-spin' : ''} style={energy.pv > IDLE_W ? { animationDuration: '14s' } : undefined} />}
        color={C.solar}
        onClick={() => setView('energy')}
        compact={compact}
      >
        <ArcGauge value={kw} max={max} digits={2} unit="kW" colors={['#fb923c', C.solar]} label={energy.dailyYield != null ? `Heute ${num(energy.dailyYield, 1)} kWh` : `Skala bis ${max} kW`} />
      </GaugeTile>,
    );
    if (energy.soc != null) {
      const charging = energy.battery < -IDLE_W;
      const discharging = energy.battery > IDLE_W;
      tiles.push(
        <GaugeTile key="battery" title="Batterie" icon={<BatteryIcon soc={energy.soc} charging={charging} />} color={C.green} onClick={() => setView('energy')} compact={compact}>
          <LiquidGauge percent={energy.soc} color={C.green} charging={charging} label={charging ? `lädt ${powerText(-energy.battery)}` : discharging ? `liefert ${powerText(energy.battery)}` : 'Ruhezustand'} />
        </GaugeTile>,
      );
    }
    // own supply share of the house load, if the installation does not report it itself
    const autarky = energy.autarky ?? (energy.home > 0 ? clamp((1 - Math.max(0, energy.grid) / energy.home) * 100, 0, 100) : 100);
    tiles.push(
      <GaugeTile key="autarky" title="Autarkie" icon={<Leaf size={13} />} color={C.cyan} onClick={() => setView('energy')} compact={compact}>
        <ArcGauge
          value={autarky}
          max={100}
          unit="%"
          colors={['#6366f1', C.cyan]}
          label={energy.grid > IDLE_W ? `Netzbezug ${powerText(energy.grid)}` : energy.grid < -IDLE_W ? `Einspeisung ${powerText(-energy.grid)}` : 'Netz ausgeglichen'}
        />
      </GaugeTile>,
    );
  }
  if (o.avgTemp != null) {
    tiles.push(
      <GaugeTile key="climate" title="Raumklima" icon={<Thermometer size={13} />} color={C.heat} onClick={() => setView('climate')} compact={compact}>
        <ArcGauge value={o.avgTemp} min={14} max={28} digits={1} unit="°C" colors={['#38bdf8', C.heat]} label={o.avgHumidity != null ? `Ø Luftfeuchte ${num(o.avgHumidity, 0)} %` : `Ø aus ${o.tempCount} Räumen`} />
      </GaugeTile>,
    );
  }
  if (o.lights.length) {
    tiles.push(
      <GaugeTile key="lights" title="Licht" icon={<Lightbulb size={13} />} color={C.amber} onClick={() => setView('lights')} compact={compact}>
        <SegmentRing on={o.lightsOn.length} total={o.lights.length} color={C.amber} label={o.lightsOn.length ? 'eingeschaltet' : 'alles aus'} />
      </GaugeTile>,
    );
  }
  if (o.heatpump) tiles.push(<HeatPumpGauge key="heatpump" d={o.heatpump} compact={compact} />);
  return tiles;
}

/** Gauges of the standard overview (the own start page can still place every gauge as a widget). */
const OVERVIEW_GAUGES = ['battery', 'lights', 'heatpump'];

/** The gauges of the standard overview; only what the installation has. */
function useOverviewGauges(o: Overview, energy: EnergyValues, compact = false) {
  return useGaugeTiles(o, energy, compact).filter((t) => OVERVIEW_GAUGES.includes(String(t.key)));
}

/** Live gauges; only what the installation has is shown. `compact`: kiosk grid that fills its area. */
function GaugeGrid({ o, energy, compact = false }: { o: Overview; energy: EnergyValues; compact?: boolean }) {
  const tiles = useOverviewGauges(o, energy, compact);
  if (!tiles.length) return null;
  if (compact) {
    // kiosk: up to three gauges side by side in one row, more in rows of two or three that share the height
    const cols = tiles.length <= 3 ? tiles.length : tiles.length === 4 ? 2 : 3;
    return (
      <div className="kiosk-gauges grid gap-3 h-full min-h-0" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: 'minmax(0, 1fr)' }}>
        {tiles}
      </div>
    );
  }
  return <div className={`grid gap-3 sm:gap-4 ${GAUGE_COLUMNS[Math.min(tiles.length, 6)]}`}>{tiles}</div>;
}

/** Grid columns per number of gauges, so the rows are always filled evenly. */
const GAUGE_COLUMNS: Record<number, string> = {
  1: 'grid-cols-1 max-w-xs',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-2 lg:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-5',
  6: 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-6',
};

/* ------------------------------------------------------------------ energy */

/** Small figure with a coloured top line. */
function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl px-3 py-2 border border-line" style={{ background: `color-mix(in srgb, ${color} 8%, transparent)`, borderTop: `2px solid ${color}` }}>
      <div className="text-[0.65rem] text-muted uppercase tracking-wider truncate">{label}</div>
      <div className="font-bold tabular-nums">{value}</div>
    </div>
  );
}

/**
 * Whether the flow of the compact energy panel gets more room with the figures beside it (a column of
 * about 6.5rem + gap) than below it (a row of about 3.6rem + margin) – true for wide, flat panels.
 */
function kpisBeside(w: number, h: number, flowH: number) {
  if (!w || !h) return false;
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const below = Math.min(w / 400, (h - 4.1 * rem) / flowH);
  const beside = Math.min((w - 7.25 * rem) / 400, h / flowH);
  return beside > below;
}

/**
 * Energy flow, current figures and (not in the compact kiosk layout) the curve of the last 24 hours.
 * `side` (kiosk in portrait format): the figures stand in a column beside the flow, so the flow can use
 * the full height of the panel; other compact panels pick that arrangement themselves when it gives the
 * flow more room.
 */
export function EnergyPanel({ energy, compact = false, side = false }: { energy: EnergyValues; compact?: boolean; side?: boolean }) {
  const setView = useStore((s) => s.setView);
  const ids = useStore((s) => s.config?.energy?.states) ?? NO_STATES;
  const { data } = useHistory(compact ? [] : [ids.production, ids.consumption].filter(Boolean), 24, 120000);
  const fitRef = useRef<HTMLDivElement>(null);
  const area = useElementSize(fitRef, { w: 0, h: 0 }, compact);
  const flowH = energyFlowHeight(energy.wallbox !== null);
  const beside = compact && (side || kpisBeside(area.w, area.h, flowH));
  const series: ChartSeries[] = [];
  if (ids.production) series.push({ id: 'pv', label: 'Erzeugung', color: C.solar, data: data[ids.production] ?? [] });
  if (ids.consumption) series.push({ id: 'home', label: 'Verbrauch', color: C.violet, data: data[ids.consumption] ?? [], line: true });
  const kpis = (
    <div className={beside ? 'kiosk-kpis grid grid-rows-3 gap-2 w-[6.5rem] shrink-0 content-center' : 'grid grid-cols-3 gap-2 mt-2'}>
      <Kpi label="Erzeugung" value={powerText(energy.pv)} color={C.solar} />
      <Kpi label="Verbrauch" value={powerText(energy.home)} color={C.violet} />
      <Kpi label={energy.grid >= 0 ? 'Netzbezug' : 'Einspeisung'} value={powerText(Math.abs(energy.grid))} color={C.cyan} />
    </div>
  );
  return (
    <HudPanel
      title="Energiefluss"
      color={C.cyan}
      right={<span className="inline-flex items-center gap-1"><Activity size={12} /> live</span>}
      onClick={() => setView('energy')}
      className={compact ? 'h-full min-h-0 flex flex-col' : 'h-full'}
      bodyClassName={compact ? 'flex-1 min-h-0 flex flex-col' : ''}
    >
      {compact ? (
        <div ref={fitRef} className={`flex-1 min-h-0 min-w-0 flex ${beside ? 'flex-row gap-3' : 'flex-col'}`}>
          {/* the flow is designed for 400 px width and scaled to the space that is left */}
          <FitBox baseW={400} baseH={flowH} className="flex-1 min-h-0 min-w-0">
            <EnergyFlow e={energy} bold />
          </FitBox>
          {kpis}
        </div>
      ) : (
        <>
          <EnergyFlow e={energy} />
          {kpis}
        </>
      )}
      {!compact && series.some((s) => s.data.length > 1) && (
        <div className="mt-3">
          <div className="text-[0.65rem] text-muted uppercase tracking-[0.18em] mb-1">Letzte 24 Stunden</div>
          <AreaChart series={series} compact unit="W" />
        </div>
      )}
    </HudPanel>
  );
}

/* ------------------------------------------------------------------ mower */

/**
 * The robotic mower while it mows – in place of the energy flow: live map of the session, progress, battery
 * and the mowed area; a tap opens the mower page. `compact` (kiosk): fills its area, the figures beside the
 * map on wide panels and below it on narrow ones.
 */
function MowerPanel({ d, compact = false }: { d: Device; compact?: boolean }) {
  const setView = useStore((s) => s.setView);
  const v = useStateValues(d.states);
  const status = mowerStatus(v.state);
  const track = useMemo(() => parseTrack(v.track), [v.track]);
  const progress = numOrNull(v.progress) ?? track?.percentage ?? null;
  const area = numOrNull(v.area) ?? track?.area ?? null;
  const battery = numOrNull(v.battery);
  const fitRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(fitRef, { w: 0, h: 0 }, compact);
  const beside = compact && size.w > size.h * 1.3;
  const kpis = (
    <div className={beside ? 'kiosk-kpis grid grid-rows-3 gap-2 w-[6.5rem] shrink-0 content-center' : 'grid grid-cols-3 gap-2 mt-2'}>
      <Kpi label="Fortschritt" value={progress == null ? '–' : `${num(progress, 0)} %`} color={status.color} />
      <Kpi label="Akku" value={battery == null ? '–' : `${num(battery, 0)} %`} color={battery != null && battery <= 20 ? C.alert : C.cyan} />
      <Kpi label="Gemäht" value={areaText(area)} color={C.amber} />
    </div>
  );
  const map = hasMapData(v) ? (
    <MowerMap d={d} values={v} className={compact ? 'mower-map-fill' : 'mower-map-overview'} />
  ) : (
    <span className="text-sm text-muted p-6">Noch keine Kartendaten</span>
  );
  return (
    <HudPanel
      title={<span className="inline-flex items-center gap-1.5"><LawnMower size={13} />{d.name}</span>}
      color={C.green}
      right={<span className="inline-flex items-center gap-1.5"><i className="w-1.5 h-1.5 rounded-full anim-breathe" style={{ background: status.color }} /> {status.label}</span>}
      onClick={() => setView('mower')}
      className={compact ? 'h-full min-h-0 flex flex-col' : 'h-full'}
      bodyClassName={compact ? 'flex-1 min-h-0 flex flex-col' : ''}
    >
      {compact ? (
        <div ref={fitRef} className={`flex-1 min-h-0 min-w-0 flex ${beside ? 'flex-row gap-3' : 'flex-col'}`}>
          <div className="mower-ground relative flex-1 min-h-0 min-w-0">{map}</div>
          {kpis}
        </div>
      ) : (
        <>
          <div className="mower-ground">{map}</div>
          {kpis}
        </>
      )}
    </HudPanel>
  );
}

/* ------------------------------------------------------------------ security */

/** Camera picture in a HUD frame (brackets, scan lines, LIVE marker); glows while something was detected. */
export function HudCamera({ cam }: { cam: CameraInfo }) {
  const refresh = useStore((s) => s.config?.app.snapshotRefreshSeconds ?? 3);
  const open = useStore((s) => s.openCamera);
  const evt = useRecentMotion(cam.id);
  const color = evt ? KIND_STYLE[evt.kind].color : C.violet;
  return (
    <button className="hud-cam text-left" style={{ ...toneStyle(color), boxShadow: evt ? `0 0 26px -6px ${color}` : undefined }} onClick={() => open(cam.id)}>
      <SnapshotImage id={cam.id} seconds={refresh} quality="low" className="absolute inset-0" />
      <i className="hud-frame" aria-hidden />
      <div className="absolute inset-x-0 top-0 z-[3] px-3 pt-2.5 pb-5 flex items-center gap-1.5 text-[0.68rem] font-semibold text-white bg-gradient-to-b from-black/65 to-transparent">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 anim-breathe" />
        <span className="truncate">{cam.name}</span>
        <span className="ml-auto opacity-70 tracking-[0.2em]">LIVE</span>
      </div>
      {evt && (
        <div className="absolute bottom-2 left-2 z-[3] hud-chip !text-[0.65rem] !py-0.5 backdrop-blur" style={toneStyle(color)}>
          <KindIcon kind={evt.kind} size={11} /> {MOTION_LABEL[evt.kind]} {timeAgo(evt.ts)}
        </div>
      )}
    </button>
  );
}

/** Timeline of the motion events of the last hours; the newest one pulses. */
function ActivityTimeline({ events, now, hours = 6, hideEmpty = false }: { events: MotionEvent[]; now: number; hours?: number; hideEmpty?: boolean }) {
  const from = now - hours * 3600e3;
  // newest first: everything up to the first older event
  const end = events.findIndex((e) => e.ts < from);
  const list = end < 0 ? events : events.slice(0, end);
  if (hideEmpty && !list.length) return null;
  return (
    <div className="hud-activity mt-3">
      <div className="flex justify-between text-[0.65rem] uppercase tracking-[0.18em] text-muted mb-1.5">
        <span>Aktivität · {hours} h</span>
        <span>{list.length} {list.length === 1 ? 'Ereignis' : 'Ereignisse'}</span>
      </div>
      <div className="relative h-9 rounded-xl overflow-hidden border border-line" style={{ background: 'color-mix(in srgb, var(--tone) 7%, transparent)' }}>
        {Array.from({ length: hours - 1 }, (_, i) => <i key={i} className="absolute top-0 bottom-0 w-px bg-[var(--line)]" style={{ left: `${((i + 1) / hours) * 100}%` }} />)}
        {list.map((e, i) => {
          const c = KIND_STYLE[e.kind].color;
          const size = e.kind === 'people' ? 10 : 8;
          return (
            <span
              key={motionKey(e)}
              title={`${MOTION_LABEL[e.kind]} · ${e.name} · ${clockTime(e.ts)}`}
              className={`absolute top-1/2 rounded-full ${i === 0 ? 'anim-ring' : ''}`}
              style={{ ...toneStyle(c), left: `${Math.min(98.5, ((e.ts - from) / (now - from)) * 100)}%`, width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2, background: c, boxShadow: `0 0 10px ${c}` }}
            />
          );
        })}
        <i className="absolute right-0 top-0 bottom-0 w-0.5 anim-breathe" style={{ background: 'var(--tone)', boxShadow: '0 0 8px var(--tone)' }} />
      </div>
      <div className="flex justify-between text-[0.6rem] text-muted mt-1">
        <span>−{hours} h</span>
        <span>jetzt</span>
      </div>
    </div>
  );
}

/** Cameras, activity and doors / windows; turns red while something moves. Compact: only open doors / windows. */
export function SecurityPanel({ contacts, compact = false }: { contacts: Overview['contacts']; compact?: boolean }) {
  const cameras = useStore((s) => s.cameras);
  const events = useStore((s) => s.motion);
  const now = useNow(15000);
  // newest first: the latest event decides
  const recent = events.length > 0 && now - events[0].ts < 60000;
  const shownContacts = compact ? contacts.filter((c) => c.open) : contacts;
  return (
    <HudPanel
      title="Sicherheit"
      color={recent ? C.alert : C.violet}
      right={cameras.length ? `${cameras.length} ${cameras.length === 1 ? 'Kamera' : 'Kameras'}` : undefined}
      className={compact ? `kiosk-security h-full min-h-0 flex flex-col ${shownContacts.length ? 'has-contacts' : ''}` : 'h-full'}
      bodyClassName={compact ? 'flex-1 min-h-0 flex flex-col justify-center' : ''}
    >
      {cameras.length > 0 && (
        <div className={`grid grid-cols-2 gap-2 sm:gap-3 ${compact ? 'kiosk-cams' : ''}`}>
          {cameras.slice(0, 4).map((c) => <HudCamera key={c.id} cam={c} />)}
        </div>
      )}
      {/* kiosk: an empty timeline leaves its room to the cameras */}
      <ActivityTimeline events={events} now={now} hideEmpty={compact} />
      {shownContacts.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {shownContacts.map(({ d, open }) => (
            <span key={d.id} className="hud-chip" style={toneStyle(open ? C.alert : C.green)}>
              {open ? <DoorOpen size={12} /> : <DoorClosed size={12} />} {d.name} {open ? 'offen' : 'zu'}
            </span>
          ))}
        </div>
      )}
    </HudPanel>
  );
}

/* ------------------------------------------------------------------ rooms */

/** Compact room card: temperature with scale, humidity / CO₂, heating, lamps as dots, open windows. */
export function RoomPod({ r, compact = false }: { r: RoomSummary; compact?: boolean }) {
  const setView = useStore((s) => s.setView);
  const lightsOn = r.lights.filter(Boolean).length;
  const tone = r.open.length ? C.alert : r.heating ? C.heat : lightsOn ? C.amber : C.violet;
  const active = Boolean(r.open.length || r.heating || lightsOn);
  // position on a 14 … 28 °C scale
  const pos = r.temp == null ? null : clamp((r.temp - 14) / 14, 0, 1);
  const lampTitle = `${lightsOn} von ${r.lights.length} Lichtern an`;
  const lampDots = r.lights.length > 0 && (
    <span className="flex gap-1 shrink-0" title={lampTitle}>
      {r.lights.map((on, i) => (
        <i key={i} className="w-2 h-2 rounded-full" style={on ? { background: C.amber, boxShadow: `0 0 8px ${C.amber}` } : { background: 'var(--track)' }} />
      ))}
    </span>
  );
  // compact header: a single glowing dot while any light is on, so the room name keeps its room
  const lampHint = lightsOn > 0 && (
    <i className="w-2 h-2 rounded-full shrink-0" title={lampTitle} aria-label={lampTitle} role="img" style={{ background: C.amber, boxShadow: `0 0 8px ${C.amber}` }} />
  );
  return (
    <button className={`hud-room glass !rounded-2xl ${compact ? 'px-2.5 py-2' : 'p-3'} w-full text-left relative overflow-hidden ${active ? 'is-active' : ''}`} style={toneStyle(tone)} onClick={() => setView('rooms', r.room.id)}>
      <div className="flex items-center gap-2">
        <div className={`icon-bubble on !rounded-xl ${compact ? '!w-7 !h-7' : '!w-8 !h-8'}`}><Icon name={r.room.icon} size={compact ? 14 : 16} /></div>
        <div className="font-semibold text-sm truncate flex-1">{r.room.name}</div>
        {r.open.length > 0 && <DoorOpen size={15} className="text-rose-400 anim-breathe" />}
        {r.heating && <Flame size={15} className="text-rose-400 anim-flicker" />}
        {compact && lampHint}
      </div>
      <div className={`${compact ? 'mt-1' : 'mt-2'} flex items-baseline gap-1`}>
        {r.temp != null ? (
          <>
            <span className={`${compact ? 'text-xl' : 'text-2xl'} font-bold tabular-nums`}>{num(r.temp, 1)}</span>
            <span className="text-xs text-muted">°C</span>
          </>
        ) : (
          // rooms without a thermometer show their lights or the number of devices instead
          <>
            <span className={`${compact ? 'text-xl' : 'text-2xl'} font-bold tabular-nums`}>{r.lights.length ? `${lightsOn}/${r.lights.length}` : r.deviceCount}</span>
            <span className="text-xs text-muted">{r.lights.length ? 'Lichter an' : r.deviceCount === 1 ? 'Gerät' : 'Geräte'}</span>
          </>
        )}
        {r.target != null && <span className="text-[0.7rem] text-muted ml-auto">Soll {num(r.target, 1)}°</span>}
      </div>
      {pos != null && (
        <div className="relative h-1.5 mt-1.5 rounded-full" style={{ background: 'linear-gradient(90deg, #38bdf855, #fbbf2455, #fb718555)' }}>
          <i className="absolute top-1/2 w-2.5 h-2.5 -mt-[5px] -ml-[5px] rounded-full bg-white" style={{ left: `${pos * 100}%`, boxShadow: '0 0 8px var(--tone)', transition: 'left 1s' }} />
        </div>
      )}
      {/* compact (kiosk strip): the lamp dots move into the header, humidity / CO₂ are left out */}
      {!compact && (
        <div className="mt-2 flex items-center gap-2 text-[0.7rem] text-muted min-h-[1rem]">
          {r.humidity != null && <span className="inline-flex items-center gap-0.5"><Droplets size={11} /> {num(r.humidity, 0)} %</span>}
          {r.co2 != null && <span>CO₂ {num(r.co2, 0)}</span>}
          <span className="ml-auto">{lampDots}</span>
        </div>
      )}
    </button>
  );
}

/**
 * All rooms at a glance; `strip`: one row that scrolls sideways (kiosk); `columns`: the strip shows that
 * many rooms at once (kiosk in portrait format: wide enough for the names), the rest scrolls.
 */
export function RoomMatrix({ rooms, strip = false, columns }: { rooms: RoomSummary[]; strip?: boolean; columns?: number }) {
  const cols = columns ? Math.min(columns, rooms.length) : 0;
  return (
    <HudPanel title="Räume im Blick" color={C.violet} right={`${rooms.length} Räume`} className="min-w-0">
      {strip && cols ? (
        <div className="grid grid-flow-col gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory" style={{ gridAutoColumns: `calc((100% - ${cols - 1} * 0.75rem) / ${cols})` }}>
          {rooms.map((r) => <div key={r.room.id} className="snap-start min-w-0"><RoomPod r={r} compact /></div>)}
        </div>
      ) : strip ? (
        <div className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory">
          {rooms.map((r) => (
            <div key={r.room.id} className="w-[9.5rem] shrink-0 snap-start">
              <RoomPod r={r} compact />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 9rem), 1fr))' }}>
          {rooms.map((r) => <RoomPod key={r.room.id} r={r} />)}
        </div>
      )}
    </HudPanel>
  );
}

/* ------------------------------------------------------------------ scenes / lights */

/**
 * Scene buttons in neon style (the pressed one lights up briefly); compact: two columns that fill the
 * panel (kiosk); `row`: up to four columns across the full width (kiosk in portrait format).
 */
export function ScenePanel({ compact = false, row = false }: { compact?: boolean; row?: boolean }) {
  const scenes = useStore((s) => s.config!.scenes);
  const runScene = useStore((s) => s.runScene);
  const ripples = useStore((s) => s.display.effects !== 'low');
  const [fired, setFired] = useState<string | null>(null);
  // touch point of the last tap (button-relative), the ripple spreads from there
  const [ripple, setRipple] = useState<{ id: string; x: number; y: number; n: number } | null>(null);
  const start = (id: string, name: string, e: { clientX: number; clientY: number; currentTarget: HTMLElement }) => {
    void runScene(id, name);
    setFired(id);
    const r = e.currentTarget.getBoundingClientRect();
    // the kiosk zoom scales the box but not the offset inside it
    const zoom = r.width / (e.currentTarget.offsetWidth || r.width);
    if (ripples) setRipple((p) => ({ id, x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom, n: (p?.n ?? 0) + 1 }));
    setTimeout(() => setFired((f) => (f === id ? null : f)), 700);
    setTimeout(() => setRipple((p) => (p?.id === id ? null : p)), 750);
  };
  return (
    <HudPanel title="Szenen" color={C.violet} className={compact ? 'h-full min-h-0 flex flex-col' : ''} bodyClassName={compact ? 'flex-1 min-h-0 overflow-y-auto no-scrollbar' : ''}>
      <div className={row ? 'grid gap-2' : compact ? 'grid grid-cols-2 gap-2' : 'flex flex-wrap gap-2'} style={row ? { gridTemplateColumns: `repeat(${Math.min(4, Math.max(2, scenes.length))}, minmax(0, 1fr))` } : undefined}>
        {scenes.map((s) => (
          <motion.button
            key={s.id}
            whileTap={{ scale: 0.94 }}
            whileHover={{ y: -2 }}
            className={`hud-chip ripple-host !py-2 !px-3.5 !text-sm !rounded-xl ${compact || row ? 'justify-start min-w-0' : ''} ${fired === s.id ? 'scene-fired' : ''}`}
            style={toneStyle(C.violet)}
            onClick={(e) => start(s.id, s.name, e)}
          >
            {ripple?.id === s.id && <span key={ripple.n} className="ripple" style={{ left: ripple.x, top: ripple.y }} />}
            <Icon name={s.icon} size={16} /> <span className="truncate">{s.name}</span>
          </motion.button>
        ))}
      </div>
    </HudPanel>
  );
}

/** Section heading with an optional "more" link and extra controls on the right. */
function SectionTitle({ children, action, extra }: { children: ReactNode; action?: { label: string; onClick: () => void }; extra?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h2 className="section-title">{children}</h2>
      <div className="flex items-center gap-3">
        {extra}
        {action && (
          <button className="text-xs text-muted hover:text-fg inline-flex items-center gap-1 transition-colors" onClick={action.onClick}>
            {action.label} <ArrowRight size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ page */

/**
 * Kiosk layout (permanent screen, optimised for 1280×800): everything on one screen without
 * scrolling – hero on top, gauges / energy / security in the middle (they share the remaining
 * height), rooms as a sideways scrolling strip and the scenes at the bottom.
 */
function KioskDashboard() {
  const portrait = usePortrait();
  if (portrait) return <KioskPortraitDashboard />;
  return <KioskLandscapeDashboard />;
}

/**
 * Kiosk layout in portrait format (optimised for 800×1280, e.g. 1200×1920 at 1.5×): the panels are
 * stacked – hero, gauges, energy | security (both share the remaining height), rooms strip and scenes.
 */
function KioskPortraitDashboard() {
  const o = useOverview();
  const energy = useEnergy();
  const scenes = useStore((s) => s.config!.scenes);
  const reduceEffects = useStore((s) => s.display.kioskReduceEffects);
  const hasSecurity = useStore((s) => s.cameras.length > 0 || s.motion.length > 0) || o.contacts.length > 0;
  const hasGauges = useOverviewGauges(o, energy, true).length > 0;
  // while the mower mows, its map takes the place of the energy flow
  const mower = useActiveMower();
  const hasFlow = energy.enabled || mower !== null;
  const hasPanels = hasFlow || hasSecurity;
  const printing = usePrintOnOverview();
  const music = useSpotifyOnDashboard();
  // the gauges (three in a flat row) need less height than the flow and the cameras, which grow with every pixel;
  // below the minimum heights (alarm banners, many strips) the page scrolls instead of squeezing the panels
  // content rows use max-content: with 'auto' Chromium underestimates overflow-hidden panels and the rows overlap
  const rows = ['max-content', printing && 'max-content', music && 'max-content', hasGauges && 'minmax(6.5rem, 0.55fr)', hasPanels && 'minmax(14rem, 1.35fr)', o.rooms.length > 0 && 'max-content', scenes.length > 0 && 'max-content'].filter(Boolean).join(' ');
  return (
    <div className={`kiosk-dash kiosk-portrait kiosk-scroll grid gap-3 ${reduceEffects ? 'kiosk-reduce-effects' : ''}`} style={{ gridTemplateRows: rows }}>
      <HeroPanel o={o} energy={energy} portrait />
      {printing && <PrinterStrip />}
      {music && <SpotifyStrip />}
      {hasGauges && <GaugeGrid o={o} energy={energy} compact />}
      {hasPanels && (
        <div className="kiosk-fill grid gap-3 min-h-0" style={{ gridTemplateColumns: hasFlow && hasSecurity ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)' }}>
          {mower ? <MowerPanel d={mower} compact /> : energy.enabled && <EnergyPanel energy={energy} compact side />}
          {hasSecurity && <SecurityPanel contacts={o.contacts} compact />}
        </div>
      )}
      {o.rooms.length > 0 && <RoomMatrix rooms={o.rooms} strip columns={4} />}
      {scenes.length > 0 && <ScenePanel row />}
    </div>
  );
}

/** Kiosk layout in landscape format, see `KioskDashboard`. */
function KioskLandscapeDashboard() {
  const o = useOverview();
  const energy = useEnergy();
  const scenes = useStore((s) => s.config!.scenes);
  const reduceEffects = useStore((s) => s.display.kioskReduceEffects);
  const hasSecurity = useStore((s) => s.cameras.length > 0 || s.motion.length > 0) || o.contacts.length > 0;
  const printing = usePrintOnOverview();
  const music = useSpotifyOnDashboard();
  // while the mower mows, its map takes the place of the energy flow
  const mower = useActiveMower();
  const middle = ['minmax(0, 1.15fr)', (energy.enabled || mower) && 'minmax(0, 1fr)', hasSecurity && 'minmax(0, 1fr)'].filter(Boolean).join(' ');
  // below the minimum height (alarm banners) the page scrolls instead of squeezing the gauges
  const rows = ['max-content', (printing || music) && 'max-content', 'minmax(14rem, 1fr)', 'max-content'].filter(Boolean).join(' ');
  return (
    <div className={`kiosk-dash kiosk-scroll grid gap-3 ${reduceEffects ? 'kiosk-reduce-effects' : ''}`} style={{ gridTemplateRows: rows }}>
      <HeroPanel o={o} energy={energy} compact />
      {(printing || music) && (
        // print and music share one row, so the gauges keep their height
        <div className="grid gap-3 min-w-0" style={{ gridTemplateColumns: printing && music ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)' }}>
          {printing && <PrinterStrip />}
          {music && <SpotifyStrip half={printing} />}
        </div>
      )}
      <div className="kiosk-fill grid gap-3 min-h-0" style={{ gridTemplateColumns: middle }}>
        <GaugeGrid o={o} energy={energy} compact />
        {mower ? <MowerPanel d={mower} compact /> : energy.enabled && <EnergyPanel energy={energy} compact />}
        {hasSecurity && <SecurityPanel contacts={o.contacts} compact />}
      </div>
      {(o.rooms.length > 0 || scenes.length > 0) && (
        <div className="grid gap-3 min-h-0" style={{ gridTemplateColumns: o.rooms.length && scenes.length ? 'minmax(0, 1fr) minmax(0, 19rem)' : 'minmax(0, 1fr)' }}>
          {o.rooms.length > 0 && <RoomMatrix rooms={o.rooms} strip />}
          {scenes.length > 0 && <ScenePanel compact />}
        </div>
      )}
    </div>
  );
}

/**
 * Dashboard page in the design chosen for this device: "Nexus" (digital twin, loaded on demand), the
 * own start page (widgets, loaded on demand) or the standard command centre – as one-screen kiosk
 * layout on a kiosk display, otherwise scrolling.
 */
export function Dashboard() {
  const kiosk = useKioskLayout(useStore((s) => s.display.kiosk));
  const design = useStore((s) => s.display.dashboardDesign);
  if (design === 'nexus' || design === 'custom') {
    return (
      <Suspense fallback={<Loading />}>
        {design === 'nexus' ? <NexusDashboard fill={kiosk} /> : <CustomDashboard fill={kiosk} />}
      </Suspense>
    );
  }
  return kiosk ? <KioskDashboard /> : <StandardDashboard />;
}

/** Scrolling overview for phones, tablets and desktops. */
function StandardDashboard() {
  const o = useOverview();
  const energy = useEnergy();
  const scenes = useStore((s) => s.config!.scenes);
  const hasSecurity = useStore((s) => s.cameras.length > 0 || s.motion.length > 0) || o.contacts.length > 0;
  const setView = useStore((s) => s.setView);
  const set = useStore((s) => s.set);
  const printing = usePrintOnOverview();
  const music = useSpotifyOnDashboard();
  // while the mower mows, its map takes the place of the energy flow
  const mower = useActiveMower();
  const hasFlow = energy.enabled || mower !== null;

  return (
    <Stagger className="standard-dash flex flex-col gap-4 sm:gap-5">
      <Rise>
        <HeroPanel o={o} energy={energy} />
      </Rise>

      {(printing || music) && (
        <Rise>
          {/* side by side on wide screens when both run */}
          <div className={`grid gap-4 sm:gap-5 ${printing && music ? 'xl:grid-cols-2' : ''}`}>
            {printing && <PrinterPanel />}
            {music && <SpotifyPanel />}
          </div>
        </Rise>
      )}

      <Rise>
        <GaugeGrid o={o} energy={energy} />
      </Rise>

      {(hasFlow || hasSecurity) && (
        <Rise>
          {/* energy (or the mowing mower) and security side by side on wide screens when both exist */}
          <div className={`grid gap-4 sm:gap-5 ${hasFlow && hasSecurity ? 'lg:grid-cols-2' : ''}`}>
            {mower ? <MowerPanel d={mower} /> : energy.enabled && <EnergyPanel energy={energy} />}
            {hasSecurity && <SecurityPanel contacts={o.contacts} />}
          </div>
        </Rise>
      )}

      {o.rooms.length > 0 && (
        <Rise>
          <RoomMatrix rooms={o.rooms} />
        </Rise>
      )}

      {scenes.length > 0 && (
        <Rise>
          <ScenePanel />
        </Rise>
      )}

      {o.lightsOn.length > 0 && (
        <Rise>
          <SectionTitle
            action={{ label: 'Alle Lichter', onClick: () => setView('lights') }}
            extra={
              <button className="btn !py-1.5 !text-xs" onClick={() => switchAllOff(o.lightsOn, set)}>
                <Power size={13} /> Alle aus
              </button>
            }
          >
            Eingeschaltet
          </SectionTitle>
          <div className="grid-cards">
            <DeviceTiles devices={o.lightsOn.slice(0, 8)} />
          </div>
        </Rise>
      )}

      {o.devices.length === 0 && (
        <Rise>
          <Empty icon={<LayoutGrid size={28} />} title="Noch keine Geräte eingerichtet" text="Öffne die Einstellungen und lasse deine ioBroker-Installation automatisch erkennen.">
            <OpenSettingsButton />
          </Empty>
        </Rise>
      )}
    </Stagger>
  );
}