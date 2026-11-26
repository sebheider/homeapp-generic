/**
 * Overview page in the optional "Nexus" design (chosen per device under Einstellungen → Anzeige):
 * a holographic digital twin of the house in the middle, framed by cockpit panels –
 *   left:   clock with day line, hints (notifications and tips), music while it plays, room climate
 *   right:  weather with a 12 h curve, security (cameras, doors / windows), a running 3D print, lights
 *   bottom: energy flow with a 24 h waveform, scenes
 * Always dark (the app shell switches to the dark theme while it is shown). Every panel leads to its
 * page. `fill` (kiosk): the cockpit fills exactly one screen on wide displays; smaller screens stack the
 * panels and scroll. Kiosk in portrait format (`NexusTall`, e.g. 1200×1920): clock and weather (with
 * CO₂ traffic light and UV index) on top, the twin as a big framed panel with its callouts as cards on
 * the right, below only what is going on (cameras after a detection, open doors, print, music) next to
 * lights and scenes, energy at the bottom. Notifications are behind the bell of the top bar there.
 * Uses the same data as the standard design (lib/overview.ts).
 */
import '@fontsource/orbitron/latin-600.css';
import '@fontsource/orbitron/latin-700.css';
import '@fontsource/rajdhani/latin-500.css';
import '@fontsource/rajdhani/latin-600.css';
import '@fontsource/rajdhani/latin-700.css';
import './nexus.css';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronRight, CircleAlert, CircleCheck, DoorClosed, DoorOpen, Droplets, Flame, Info, Sun, TriangleAlert, Wind, BatteryLow } from 'lucide-react';
import { isOn, useStateValues, useStore, type View } from '../lib/store';
import { co2Limits, co2Status, kioskValue } from '../lib/kiosk';
import { Icon } from '../lib/icons';
import { clamp, greeting, num, powerText, timeAgo, toNum } from '../lib/format';
import { switchAllOff } from '../lib/selectors';
import { describeCode, fmtTime, useLocalWeather, useWeatherData, uvLevel } from '../lib/weather';
import type { WeatherData } from '../lib/api';
import { useNow } from '../lib/hooks';
import { usePortrait } from '../lib/display';
import { flowDuration } from '../lib/perf';
import { SEVERITY } from '../lib/alerts';
import { OUTSIDE, floorOf, useOverview, type Overview } from '../lib/overview';
import { heatPumpRunning, heatPumpWatts } from '../lib/heatpump';
import { MOTION_LABEL, type ActiveAlert, type CameraInfo, type MotionEvent, type Series } from '../lib/types';
import { recentMotionCameras } from '../lib/cameraPopups';
import { useEnergy, IDLE_W, type EnergyValues } from '../components/Energy';
import { KindIcon, SnapshotImage, useRecentMotion } from '../components/Cameras';
import { PrinterWebcam, usePrintOnOverview } from '../components/Printer';
import { SpotifyControls, SpotifyCover, SpotifyProgress, SpotifyVolume, useSpotifyOnDashboard, Equalizer } from '../components/Spotify';
import { duration, fileLabel, finishTime, percent } from '../lib/printer';
import { useHistory } from '../components/Charts';
import { WeatherIcon } from '../components/WeatherIcon';
import { useNotifications } from '../components/Notifications';
import { HomeTwin, NX, tempColor } from '../components/HomeTwin';
import { KioskSensorsPanel, useKioskAgents } from '../components/KioskSensors';

const NO_STATES: Record<string, string> = {};
const pad = (n: number) => String(n).padStart(2, '0');
const tone = (c: string) => ({ '--tone': c }) as CSSProperties;
const tc = (c: string) => ({ '--tc': c }) as CSSProperties;
/** "HH:MM" -> hours as a fraction (null if not a time). */
const hours = (t: string) => {
  const m = /(\d{1,2}):(\d{2})/.exec(t);
  return m ? Number(m[1]) + Number(m[2]) / 60 : null;
};

/* ------------------------------------------------------------------ frame */

/** Glass panel with cut corners; `to` makes the header a link to that page. */
function Panel({ title, right, to, color = NX.cyan, className = '', children }: { title: ReactNode; right?: ReactNode; to?: View; color?: string; className?: string; children: ReactNode }) {
  const setView = useStore((s) => s.setView);
  const head = (
    <>
      {title}
      <span className="nx-bars"><i /><i /><i /></span>
      {right != null && <span className="nx-r">{right}</span>}
      {to && <ChevronRight size={13} className="nx-go" />}
    </>
  );
  return (
    <section className={`nx-panel ${className}`} style={tone(color)}>
      <div className="nx-in">
        {to ? <button className="nx-pt" onClick={() => setView(to)}>{head}</button> : <div className="nx-pt">{head}</div>}
        <div className="nx-body">{children}</div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ left */

/** Big clock, date, greeting and the day line (daylight from sunrise to sunset, current time). */
function Chrono({ weather }: { weather: WeatherData | null }) {
  const d = new Date(useNow(1000));
  const today = weather?.configured ? weather.daily[0] : undefined;
  const rise = today?.sunrise != null ? fmtTime(today.sunrise, weather!.timezone) : null;
  const set = today?.sunset != null ? fmtTime(today.sunset, weather!.timezone) : null;
  const pos = (h: number) => `${((h / 24) * 100).toFixed(2)}%`;
  const now = d.getHours() + d.getMinutes() / 60;
  const riseH = rise ? hours(rise) : null;
  const setH = set ? hours(set) : null;
  return (
    <Panel title="Lokalzeit" right={d.toLocaleDateString('de-DE', { weekday: 'short' }).toUpperCase()}>
      <div className="nx-clock">
        <div className="nx-hm">{pad(d.getHours())}:{pad(d.getMinutes())}</div>
        <div className="nx-sec"><b>{pad(d.getSeconds())}</b><i>SEK</i></div>
      </div>
      <div className="nx-date">{d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(',', ' ·')}</div>
      <div className="nx-greet"><span>{greeting(d)}</span>.</div>
      <div className="nx-day">
        <div className="track" />
        {riseH != null && setH != null && <div className="sun" style={{ left: pos(riseH), width: pos(setH - riseH) }} />}
        <div className="now" style={{ left: pos(now) }} />
        {riseH != null && <span className="lb" style={{ left: pos(riseH), transform: 'translateX(-50%)' }}>☀ {rise}</span>}
        {setH != null && Math.abs(now - setH) > 1.2 && <span className="lb" style={{ left: pos(setH), transform: 'translateX(-50%)' }}>☾ {set}</span>}
        <span className="lb" style={{ left: pos(now), transform: now > 20 ? 'translateX(calc(-100% - 6px))' : 'translateX(6px)', color: NX.cyan }}>JETZT</span>
      </div>
    </Panel>
  );
}

interface Hint {
  key: string;
  color: string;
  icon: ReactNode;
  title: string;
  text: string;
  onClick?: () => void;
}

/** Notifications first, then tips derived from the live values; "all fine" if there is nothing. */
function useHints(o: Overview, energy: EnergyValues, max: number): Hint[] {
  const { visible } = useNotifications();
  const openTarget = useStore((s) => s.openTarget);
  const show = useStore((s) => s.showNotifications);
  const setView = useStore((s) => s.setView);
  const co2Max = co2Limits(useStore((s) => s.config?.ventilation)).yellow;
  const hints: Hint[] = visible.slice(0, max).map((a: ActiveAlert) => {
    const Ico = a.severity === 'alarm' ? CircleAlert : a.severity === 'warning' ? TriangleAlert : Info;
    return {
      key: a.id,
      color: SEVERITY[a.severity].color,
      icon: <Ico size={17} />,
      title: a.name,
      text: a.message.startsWith(a.name) ? a.message.slice(a.name.length).replace(/^[\s:–-]+/, '') || a.message : a.message,
      onClick: a.view ? () => openTarget(a.view, a.room) : () => show(true),
    };
  });
  const noted = new Set(visible.map((a) => a.room).filter(Boolean));
  const tip = (h: Hint) => hints.length < max && hints.push(h);
  if (energy.enabled && energy.grid < -800) {
    tip({ key: 'pv', color: NX.amber, icon: <Sun size={17} />, title: `Solarüberschuss ${powerText(-energy.grid)}`, text: 'Guter Zeitpunkt für Waschmaschine, Spülmaschine oder Wallbox.', onClick: () => setView('energy') });
  }
  for (const r of o.rooms) {
    if (noted.has(r.room.id)) continue;
    if (r.open.length && r.heating) tip({ key: `heat-${r.room.id}`, color: NX.orange, icon: <Flame size={17} />, title: `${r.room.name}: ${r.open[0].name} offen`, text: 'Die Heizung läuft – herunterregeln spart Energie.', onClick: () => setView('rooms', r.room.id) });
    else if (r.co2 != null && r.co2 >= co2Max) tip({ key: `co2-${r.room.id}`, color: NX.cyan, icon: <Wind size={17} />, title: `${r.room.name}: CO₂ ${num(r.co2, 0)} ppm`, text: 'Lüften empfohlen – frische Luft hilft der Konzentration.', onClick: () => setView('rooms', r.room.id) });
    else if (r.humidity != null && r.humidity > 65 && !OUTSIDE.test(r.room.name)) tip({ key: `hum-${r.room.id}`, color: NX.cyan, icon: <Droplets size={17} />, title: `${r.room.name}: Luftfeuchte ${num(r.humidity, 0)} %`, text: 'Lüften beugt Schimmel vor.', onClick: () => setView('rooms', r.room.id) });
  }
  if (energy.enabled && energy.soc != null && energy.soc < 15 && energy.battery > IDLE_W) {
    tip({ key: 'soc', color: NX.amber, icon: <BatteryLow size={17} />, title: `Batterie bei ${num(energy.soc, 0)} %`, text: 'Der Speicher ist fast leer – gleich kommt der Strom aus dem Netz.', onClick: () => setView('energy') });
  }
  if (!hints.length) hints.push({ key: 'ok', color: NX.green, icon: <CircleCheck size={17} />, title: 'Alles im grünen Bereich', text: 'Keine Meldungen – alle Systeme laufen.' });
  return hints;
}

function Hints({ o, energy, max }: { o: Overview; energy: EnergyValues; max: number }) {
  const hints = useHints(o, energy, max);
  const count = useNotifications().visible.length;
  return (
    <Panel title="Hinweise" right={count ? `${count} AKTIV` : 'KEINE'} color={count ? NX.amber : NX.cyan}>
      {hints.map((h) => {
        const body = (
          <>
            <span className="ic">{h.icon}</span>
            <span className="min-w-0"><h4>{h.title}</h4><p>{h.text}</p></span>
            {h.onClick && <ChevronRight size={14} className="text-[var(--nx-muted)]" />}
          </>
        );
        return h.onClick ? <button key={h.key} className="nx-tip" style={tc(h.color)} onClick={h.onClick}>{body}</button> : <div key={h.key} className="nx-tip" style={tc(h.color)}>{body}</div>;
      })}
    </Panel>
  );
}

/** Temperatures of all rooms on a cold … hot bar with the setpoint as tick. */
function Climate({ o }: { o: Overview }) {
  const setView = useStore((s) => s.setView);
  const rows = o.rooms.filter((r) => r.temp != null && !OUTSIDE.test(r.room.name));
  if (!rows.length) return null;
  const x = (v: number) => `${(clamp((v - 16) / 10, 0, 1) * 100).toFixed(1)}%`;
  return (
    <Panel title="Raumklima" right={o.avgTemp != null ? `Ø ${num(o.avgTemp, 1)} °C` : undefined} to="climate" className="nx-grow">
      <div className="nx-list">
        {rows.map((r) => {
          const c = tempColor(r.temp);
          const humid = r.humidity != null && r.humidity > 65;
          return (
            <button key={r.room.id} className="nx-row" style={{ color: c }} onClick={() => setView('rooms', r.room.id)}>
              <span className="rn">
                <span>{r.room.name}</span>
                {r.heating && <Flame size={13} color={NX.orange} className="shrink-0" />}
                {r.open.length > 0 && <DoorOpen size={13} color={NX.amber} className="shrink-0" />}
              </span>
              <span className="nx-bar">{r.target != null && <u style={{ left: x(r.target) }} />}<i style={{ left: x(r.temp!) }} /></span>
              <span className="rt">{num(r.temp!, 1)}°</span>
              <span className="rh" style={humid ? { color: NX.amber } : undefined}>{r.humidity != null ? `${num(r.humidity, 0)} %` : r.co2 != null ? `${num(r.co2, 0)} ppm` : ''}</span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ centre */

/** Digital twin with its header and the state line of the house; `framed` (kiosk in portrait format): as a panel, callouts as cards on the right. */
function Center({ o, energy, framed = false }: { o: Overview; energy: EnergyValues; framed?: boolean }) {
  const setView = useStore((s) => s.setView);
  const show = useStore((s) => s.showNotifications);
  const ws = useStore((s) => s.wsConnected);
  const { visible, open, top } = useNotifications();
  const hp = useStateValues(o.heatpump?.states ?? NO_STATES);
  const indoor = o.rooms.filter((r) => !OUTSIDE.test(r.room.name));
  const floors = new Set(indoor.map((r) => floorOf(r.room))).size;

  // most severe notification per room colours that room
  const alertColors: Record<string, string> = {};
  for (const a of visible) if (a.room && a.severity !== 'info' && !alertColors[a.room]) alertColors[a.room] = a.severity === 'alarm' ? NX.red : NX.amber;

  const charging = energy.battery < -IDLE_W;
  const discharging = energy.battery > IDLE_W;
  const cop = hp.cop != null ? toNum(hp.cop) : null;
  const flow = hp.flowTemp != null ? toNum(hp.flowTemp) : null;
  const running = o.heatpump ? heatPumpRunning(o.heatpump, hp) : false;
  const hpState = running ? 'läuft' : isOn(hp.power) ? 'bereit' : 'aus';
  const hpWatts = o.heatpump?.states.electricPower ? heatPumpWatts(o.heatpump, hp.electricPower) : null;
  const hpSub = [hpState, running && hpWatts != null ? powerText(hpWatts) : null, cop != null && flow != null ? `VL ${num(flow, 0)} °C` : null].filter(Boolean).join(' · ');

  const state = open.length || top === 'alarm' ? 'alarm' : top === 'warning' ? 'warning' : 'ok';
  const color = state === 'alarm' ? NX.red : state === 'warning' ? NX.amber : NX.cyan;
  const parts: { label: string; value: string; color?: string }[] = [];
  if (energy.enabled) parts.push({ label: 'Energie', value: energy.grid > IDLE_W ? `Netz ${powerText(energy.grid)}` : energy.grid < -IDLE_W ? `Einspeisung ${powerText(-energy.grid)}` : 'autark' });
  if (o.contacts.length) parts.push({ label: 'Sicherheit', value: o.openContacts.length ? `${o.openContacts.length} offen` : 'alles zu', color: o.openContacts.length ? NX.amber : undefined });
  if (o.avgTemp != null) parts.push({ label: 'Klima', value: `Ø ${num(o.avgTemp, 1)} °C` });
  if (visible.length) parts.push({ label: 'Meldungen', value: String(visible.length), color });

  const live = <span className="nx-live" style={{ ['--dot' as string]: ws ? NX.red : NX.muted }}>{ws ? 'Live' : 'Offline'}</span>;
  const twin = (
        <HomeTwin
          rail={framed}
          rooms={indoor}
          alertColors={alertColors}
          onRoom={(id) => setView('rooms', id)}
          solar={energy.enabled ? { name: 'Solar', value: powerText(energy.pv), sub: energy.dailyYield != null ? `heute ${num(energy.dailyYield, 1)} kWh` : 'Photovoltaik', color: NX.amber, onClick: () => setView('energy') } : null}
          battery={
            energy.enabled && energy.soc != null
              ? { name: 'Batterie', value: `${num(energy.soc, 0)} %`, sub: charging ? `lädt ${powerText(-energy.battery)}` : discharging ? `liefert ${powerText(energy.battery)}` : 'Ruhezustand', color: NX.green, soc: energy.soc, onClick: () => setView('energy') }
              : null
          }
          heatpump={
            o.heatpump
              ? { name: 'Wärmepumpe', value: cop != null ? `COP ${num(cop, 1)}` : flow != null ? `${num(flow, 0)} °C` : hpState, sub: hpSub, color: NX.orange, onClick: () => setView('climate') }
              : null
          }
        />
  );
  const status = (
    <button className="nx-status" style={tone(color)} onClick={() => show(true)} aria-label="Benachrichtigungen öffnen">
      <div className="st">{state === 'alarm' ? 'Alarm' : state === 'warning' ? 'Warnung' : 'System optimal'}</div>
      {parts.length > 0 && (
        <div className="ss">
          {parts.map((p) => <span key={p.label}>{p.label}<b style={p.color ? { color: p.color } : undefined}>{p.value}</b></span>)}
        </div>
      )}
    </button>
  );
  if (framed) {
    return (
      <Panel title="Digital Twin" right={<span className="nx-twin-r">{floors} {floors === 1 ? 'Etage' : 'Etagen'} · {indoor.length} Räume{live}</span>} color={color} className="nx-twin">
        <div className="nx-stage">{twin}</div>
        {status}
      </Panel>
    );
  }
  return (
    <section className="nx-center">
      <div className="nx-chead">
        <b>Digital Twin</b>
        <span className="mid">{floors} {floors === 1 ? 'Etage' : 'Etagen'} · {indoor.length} Räume · {o.devices.length} Geräte</span>
        {live}
      </div>
      <div className="nx-stage">{twin}</div>
      {status}
    </section>
  );
}

/* ------------------------------------------------------------------ right */

/** Outside conditions (local station first) and – unless `compact` (kiosk) – the temperature of the next 12 hours; `children` below. */
function Atmosphere({ weather, fallback, compact, children }: { weather: WeatherData | null; fallback: number | null; compact: boolean; children?: ReactNode }) {
  const enabled = useStore((s) => s.config?.weather?.enabled !== false);
  const setView = useStore((s) => s.setView);
  const local = useLocalWeather();
  const web = weather?.configured ? weather : null;
  const cur = web?.current;
  const temp = local.temperature ?? cur?.temp ?? fallback;
  if (!enabled || (temp == null && !cur)) return children ? <Panel title="Raumluft">{children}</Panel> : null;
  const cond = describeCode(cur?.code);
  const today = web?.daily[0];
  const humidity = local.humidity ?? cur?.humidity ?? null;
  const wind = local.windSpeed ?? cur?.wind ?? null;
  const now = Date.now() / 1000;
  const hourly = compact ? [] : (web?.hourly ?? []).filter((h) => h.t >= now - 3600 && h.temp != null).slice(0, 13);
  let curve: ReactNode = null;
  if (hourly.length >= 4) {
    const vals = hourly.map((h) => h.temp!);
    const mn = Math.min(...vals) - 0.5;
    const mx = Math.max(...vals) + 0.5;
    const W = 360;
    const p = vals.map((v, k) => [4 + (k / (vals.length - 1)) * (W - 8), 16 + (1 - (v - mn) / (mx - mn)) * 26] as const);
    const line = p.map((q) => q.map((v) => v.toFixed(1)).join(',')).join(' ');
    const marks = [0, 3, 6, 9, 12].filter((k) => k < p.length);
    curve = (
      <svg className="nx-curve" viewBox={`0 0 ${W} 62`} preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="nxWa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={NX.cyan} stopOpacity=".35" /><stop offset="1" stopColor={NX.cyan} stopOpacity="0" /></linearGradient>
        </defs>
        <polygon points={`4,46 ${line} ${W - 4},46`} fill="url(#nxWa)" />
        <polyline points={line} fill="none" stroke="#7cefff" strokeWidth="2" vectorEffect="non-scaling-stroke" style={{ filter: 'drop-shadow(0 0 4px #22e4ff)' }} />
        <circle cx={p[0][0]} cy={p[0][1]} r="3.5" fill="#fff" />
        {marks.map((k) => {
          const anchor = k === 0 ? 'start' : k === p.length - 1 || k === 12 ? 'end' : 'middle';
          return (
            <g key={k}>
              <text className="v" x={p[k][0]} y={p[k][1] - 6} textAnchor={anchor}>{num(vals[k], 0)}°</text>
              <text x={p[k][0]} y={60} textAnchor={anchor}>{k === 0 ? 'JETZT' : fmtTime(hourly[k].t, web!.timezone)}</text>
            </g>
          );
        })}
      </svg>
    );
  }
  return (
    <Panel title="Atmosphäre" right={hourly.length >= 4 ? 'NÄCHSTE 12 H' : undefined} to="weather">
      <button className="nx-wx" onClick={() => setView('weather')}>
        {cur ? <WeatherIcon kind={cond.kind} isDay={cur.isDay} size={74} code={cur.code} wind={local.windSpeed ?? cur.wind} temp={temp} /> : <span />}
        <span className="min-w-0">
          <span className="t block">{temp == null ? '–' : num(temp, 1)}<small>°C</small></span>
          {cur && <span className="d block">{cond.label}{cur.feelsLike != null ? ` · gefühlt ${num(cur.feelsLike, 0)}°` : ''}</span>}
          <span className="m">
            {today?.tMax != null && today.tMin != null && <span>↑{num(today.tMax, 0)}° ↓{num(today.tMin, 0)}°</span>}
            {wind != null && <span><Wind size={12} /> {num(wind, 0)} km/h</span>}
            {humidity != null && <span><Droplets size={12} /> {num(humidity, 0)} %</span>}
          </span>
        </span>
      </button>
      {curve}
      {children}
    </Panel>
  );
}

/**
 * CO₂ as a traffic light – thresholds of the ventilation notification – and the UV index. CO₂ comes from the
 * wall display (the kiosk agent chosen for this device, otherwise the first one measuring CO₂), without
 * one from the room with the highest value.
 */
function AirChips({ o, uv, uvMax }: { o: Overview; uv: number | null; uvMax: number | null }) {
  const { agents } = useKioskAgents();
  const own = useStore((s) => s.display.presenceAgent);
  const limits = co2Limits(useStore((s) => s.config?.ventilation));
  const setView = useStore((s) => s.setView);
  const agent = agents.find((a) => a.id === own && a.online && kioskValue(a, 'co2') != null) ?? agents.find((a) => a.online && kioskValue(a, 'co2') != null);
  let co2 = agent ? kioskValue(agent, 'co2') : null;
  // the own wall display measures the air of the room it hangs in; other sources are named
  let where = agent && agent.id !== own ? agent.name : null;
  let room: string | null = null;
  if (co2 == null) {
    const worst = o.rooms.filter((r) => r.co2 != null && r.co2 > 0).sort((a, b) => b.co2! - a.co2!)[0];
    if (worst) {
      co2 = worst.co2;
      where = worst.room.name;
      room = worst.room.id;
    }
  }
  if (co2 == null && uv == null) return null;
  const st = co2Status(co2, limits);
  const uvl = uvLevel(uv);
  const lamp = (level: string, c: string) => <i className={st.level === level ? 'on' : ''} style={tc(c)} />;
  return (
    <div className="nx-air">
      {co2 != null && (
        <button className="nx-chip" style={tc(st.color)} onClick={() => setView(room ? 'rooms' : 'climate', room ?? undefined)} aria-label={`CO₂ ${num(co2, 0)} ppm, ${st.label}`}>
          <span className="nx-ampel" aria-hidden>{lamp('red', '#f43f5e')}{lamp('yellow', '#fbbf24')}{lamp('green', '#34d399')}</span>
          <span className="min-w-0">
            <span className="k">CO₂{where ? ` · ${where}` : ''}</span>
            <span className="v">{num(co2, 0)}<small>ppm</small></span>
            <span className="s">{st.label}</span>
          </span>
        </button>
      )}
      {uv != null && (
        <button className="nx-chip" style={tc(uvl.color)} onClick={() => setView('weather')} aria-label={`UV-Index ${num(uv, 0)}, ${uvl.label}`}>
          <span className="nx-uv" aria-hidden><i style={{ height: `${clamp(uv / 11, 0.06, 1) * 100}%` }} /></span>
          <span className="min-w-0">
            <span className="k">UV-Index</span>
            <span className="v">{num(uv, 0)}<small>{uvl.label}</small></span>
            <span className="s">{uvMax != null ? `heute max. ${num(uvMax, 0)}` : uvl.advice}</span>
          </span>
        </button>
      )}
    </div>
  );
}

const CAM_CLOCK = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Live clock for the camera overlays (keeps the per-second re-render out of the picture). */
function CamClock() {
  const now = useNow(1000);
  return <span className="nx-ts">{CAM_CLOCK.format(now).replace(',', ' ·')}</span>;
}

/** Camera picture with reticle, LIVE marker and a badge while something was detected. */
function NexusCam({ cam, refresh, event }: { cam: CameraInfo; refresh: number; event?: MotionEvent }) {
  const open = useStore((s) => s.openCamera);
  const recent = useRecentMotion(cam.id);
  const evt = event ?? recent;
  return (
    <button className={`nx-cam ${evt ? 'alert' : ''}`} onClick={() => open(cam.id)} aria-label={`Kamera ${cam.name}`}>
      <SnapshotImage id={cam.id} seconds={refresh} quality="low" className="absolute inset-0" />
      <i className="nx-ret" />
      <span className="nx-cam-ov">
        <span className="a"><span>{cam.name}</span><span className="nx-live-tag">Live</span></span>
        {evt ? <span className="nx-det"><KindIcon kind={evt.kind} size={10} /> {MOTION_LABEL[evt.kind]}{event ? ` · ${timeAgo(evt.ts)}` : ''}</span> : <CamClock />}
      </span>
    </button>
  );
}

/** Cameras, doors / windows and the last detection. */
function Security({ o, fill }: { o: Overview; fill: boolean }) {
  const cameras = useStore((s) => s.cameras);
  const last = useStore((s) => s.motion[0]);
  const refresh = useStore((s) => s.config?.app.snapshotRefreshSeconds ?? 3);
  useNow(30000);
  if (!cameras.length && !o.contacts.length) return null;
  // kiosk: only open doors / windows, so the cameras keep their space
  const contacts = [...o.contacts].filter((c) => !fill || c.open).sort((a, b) => Number(b.open) - Number(a.open)).slice(0, fill ? 2 : 8);
  const openCount = o.openContacts.length;
  return (
    <Panel title="Sicherheit" right={cameras.length ? `${cameras.length} ${cameras.length === 1 ? 'KAMERA' : 'KAMERAS'}` : openCount ? `${openCount} OFFEN` : 'ALLES ZU'} to="cameras" color={openCount ? NX.amber : NX.violet} className="nx-grow">
      {cameras.length > 0 && <div className="nx-cams">{cameras.slice(0, 4).map((c) => <NexusCam key={c.id} cam={c} refresh={refresh} />)}</div>}
      {contacts.length > 0 && (
        <div className="nx-access">
          {contacts.map(({ d, open }) => (
            <div key={d.id} className="nx-acc" style={tc(open ? NX.amber : NX.green)}>
              {open ? <DoorOpen size={15} /> : <DoorClosed size={15} />}
              <span>{d.name}</span>
              <em>{open ? 'OFFEN' : 'ZU'}</em>
            </div>
          ))}
        </div>
      )}
      {last && !fill && (
        <div className="nx-last">
          <span style={{ color: NX.amber }}>◆</span> Letzte Erkennung: <b>{MOTION_LABEL[last.kind]} · {last.name}</b> · {timeAgo(last.ts)}
        </div>
      )}
    </Panel>
  );
}

/** Cameras with a detection whose pop-up closed only a while ago (see `recentMotionCameras`), newest first. */
function useMotionCams() {
  const cameras = useStore((s) => s.cameras);
  const motion = useStore((s) => s.motion);
  const app = useStore((s) => s.config?.app);
  const now = useNow(5000);
  const seconds = { motion: app?.motionPopupSeconds ?? 30, people: app?.peoplePopupSeconds ?? 60 };
  return recentMotionCameras(motion, seconds, now)
    .map((event) => ({ event, cam: cameras.find((c) => c.id === event.cameraId) }))
    .filter((x): x is { event: MotionEvent; cam: CameraInfo } => Boolean(x.cam))
    .slice(0, 2);
}

/** Kiosk in portrait format: only after a detection (its cameras) or while doors / windows are open. */
function Alerts({ o, cams }: { o: Overview; cams: { event: MotionEvent; cam: CameraInfo }[] }) {
  const refresh = useStore((s) => s.config?.app.snapshotRefreshSeconds ?? 3);
  if (!cams.length && !o.openContacts.length) return null;
  const open = o.openContacts.slice(0, cams.length ? 2 : 4);
  return (
    <Panel title="Sicherheit" right={cams.length ? 'BEWEGUNG' : `${o.openContacts.length} OFFEN`} to="cameras" color={NX.amber}>
      {cams.length > 0 && <div className={`nx-cams ${cams.length === 1 ? 'one' : ''}`}>{cams.map(({ cam, event }) => <NexusCam key={cam.id} cam={cam} refresh={refresh} event={event} />)}</div>}
      {open.length > 0 && (
        <div className="nx-access">
          {open.map((d) => (
            <div key={d.id} className="nx-acc" style={tc(NX.amber)}>
              <DoorOpen size={15} />
              <span>{d.name}</span>
              <em>OFFEN</em>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/** Running 3D print: webcam with reticle (not in the kiosk), file, progress bar, remaining time and temperatures (`compact`: kiosk in portrait format, file and time in one line). */
function Print({ fill, compact }: { fill: boolean; compact: boolean }) {
  const show = usePrintOnOverview();
  const p = useStore((s) => s.printer);
  const now = useNow(30000);
  if (!show || !p) return null;
  const pct = percent(p);
  const end = finishTime(p.progress?.printTimeLeft, now);
  const color = p.state === 'printing' || p.state === 'finishing' ? NX.cyan : NX.amber;
  return (
    <Panel title="3D-Druck" right={`${pct ?? '–'} %`} to="printer" color={color}>
      {p.webcam.available && !fill && (
        <div className="nx-cam nx-print-cam">
          <PrinterWebcam className="absolute inset-0" />
          <i className="nx-ret" />
          <span className="nx-cam-ov">
            <span className="a"><span>{p.name}</span><span className="nx-live-tag">Live</span></span>
          </span>
        </div>
      )}
      {!compact && <div className="nx-pfile" title={p.job?.file}>{fileLabel(p.job?.file) || p.name}</div>}
      <div className="nx-pbar"><i style={{ width: `${p.progress?.completion ?? 0}%` }} /></div>
      <div className="nx-lrow">
        {/* kiosk in portrait format: one line less – the file name takes the place of the temperatures */}
        {compact && <span className="nx-pfile !mt-0 min-w-0" title={p.job?.file}>{fileLabel(p.job?.file) || p.name}</span>}
        <span className={compact ? 'ml-auto shrink-0' : ''}>NOCH {duration(p.progress?.printTimeLeft).toUpperCase()}{end ? ` · BIS ${end.toUpperCase()}` : ''}</span>
        {!compact && <span className="nx-ptemps">{p.temps.map((t) => `${t.label.toUpperCase()} ${t.actual == null ? '–' : Math.round(t.actual)}°`).join(' · ')}</span>}
      </div>
    </Panel>
  );
}

/** Music while it plays (Spotify): cover, title, position, all controls and – unless `compact` (kiosk in portrait format, position next to the cover) – the volume. */
function NowPlaying({ compact }: { compact: boolean }) {
  const show = useSpotifyOnDashboard();
  const s = useStore((x) => x.spotify);
  if (!show || !s?.track) return null;
  return (
    <Panel title="Musik" right={s.device?.name.toUpperCase()} to="spotify" color={NX.green}>
      <div className="nx-music">
        <SpotifyCover track={s.track} small className="nx-music-cover" />
        <div className="min-w-0 flex-1 nx-music-meta">
          <div className="nx-pfile !mt-0 flex items-center gap-2"><Equalizer playing={s.playing} className="shrink-0" /> <span className="truncate">{s.track.name}</span></div>
          <div className="nx-music-artist">{s.track.artists}</div>
          {compact && <SpotifyProgress s={s} compact />}
        </div>
      </div>
      {!compact && <SpotifyProgress s={s} compact className="mt-2.5" />}
      <SpotifyControls s={s} size="sm" className="mt-1.5 nx-spc" />
      {!compact && <SpotifyVolume s={s} />}
    </Panel>
  );
}

/** One segment per lamp, the lamps that are on (not when `compact`) and "Alle aus". */
function Lights({ o, compact }: { o: Overview; compact: boolean }) {
  const set = useStore((s) => s.set);
  if (!o.lights.length) return null;
  const on = new Set(o.lightsOn.map((d) => d.id));
  const names = o.lightsOn.map((d) => d.name);
  const lamps = <div className={`nx-lamps ${compact ? '!mt-0 flex-1 min-w-0' : ''}`}>{o.lights.slice(0, 16).map((d) => <i key={d.id} className={on.has(d.id) ? 'on' : ''} title={d.name} />)}</div>;
  const off = <button className="nx-btn" disabled={!names.length} onClick={() => switchAllOff(o.lightsOn, set)}>Alle aus</button>;
  return (
    <Panel title="Licht" right={`${o.lightsOn.length} / ${o.lights.length} AN`} to="lights" color={o.lightsOn.length ? NX.amber : NX.cyan}>
      {compact ? (
        <div className="nx-lrow !mt-[11px]">{lamps}{off}</div>
      ) : (
        <>
          {lamps}
          <div className="nx-lrow">
            <span>{names.length ? `${names.slice(0, 3).join(' · ')}${names.length > 3 ? ` +${names.length - 3}` : ''}` : 'Alle Lichter sind aus'}</span>
            {off}
          </div>
        </>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ bottom */

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
    if (h % 4 === 0 && x < 82) labels.push({ x, text: `${pad(h)}:00` });
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
function EnergyStrip({ energy }: { energy: EnergyValues }) {
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

const SCENE_COLORS = [NX.violet, '#3b82f6', NX.magenta, NX.amber, NX.green, NX.cyan];

/** Scene buttons in neon colours; the pressed one shows "AKTIV" for a moment. */
function Scenes() {
  const scenes = useStore((s) => s.config?.scenes ?? []);
  const run = useStore((s) => s.runScene);
  const [active, setActive] = useState<string | null>(null);
  if (!scenes.length) return null;
  const start = (id: string, name: string) => {
    void run(id, name);
    setActive(id);
    setTimeout(() => setActive((a) => (a === id ? null : a)), 2500);
  };
  return (
    <Panel title="Szenen" right={`${scenes.length}`} color={NX.violet}>
      <div className="nx-scenes">
        {scenes.map((s, i) => (
          <button key={s.id} className={`nx-scene ${active === s.id ? 'on' : ''}`} style={tc(SCENE_COLORS[i % SCENE_COLORS.length])} onClick={() => start(s.id, s.name)}>
            <Icon name={s.icon} size={18} />
            <span>{s.name}</span>
            {active === s.id && <em>AKTIV</em>}
          </button>
        ))}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ page */

/**
 * Kiosk in portrait format: clock | weather, the framed twin (takes the height that is left), then the
 * panels of the moment in two balanced columns, energy at the bottom.
 */
function NexusTall({ o, energy, weather }: { o: Overview; energy: EnergyValues; weather: WeatherData | null }) {
  const scenes = useStore((s) => s.config?.scenes.length ?? 0);
  const printShown = usePrintOnOverview();
  const hasPrinter = useStore((s) => s.printer != null);
  const musicShown = useSpotifyOnDashboard();
  const hasTrack = useStore((s) => s.spotify?.track != null);
  const printing = printShown && hasPrinter;
  const music = musicShown && hasTrack;
  const cams = useMotionCams();
  const web = weather?.configured ? weather : null;
  // estimated heights (px) balance the two columns; the order decides the column when they are equal
  const items: { key: string; h: number; node: ReactNode }[] = [];
  if (o.lights.length) items.push({ key: 'lights', h: 84, node: <Lights key="lights" o={o} compact /> });
  if (scenes) items.push({ key: 'scenes', h: 52 + Math.min(2, Math.ceil(scenes / 2)) * 51, node: <Scenes key="scenes" /> });
  if (cams.length || o.openContacts.length) items.push({ key: 'alerts', h: (cams.length ? 200 : 50) + (o.openContacts.length ? 40 : 0), node: <Alerts key="alerts" o={o} cams={cams} /> });
  if (printing) items.push({ key: 'print', h: 100, node: <Print key="print" fill compact /> });
  if (music) items.push({ key: 'music', h: 124, node: <NowPlaying key="music" compact /> });
  const cols: [ReactNode[], ReactNode[]] = [[], []];
  const height = [0, 0];
  for (const it of items) {
    const k = height[0] <= height[1] ? 0 : 1;
    cols[k].push(it.node);
    height[k] += it.h + 12;
  }
  return (
    <div className="nx nx-fill">
      <div className="nx-tall">
        <div className="nx-pair">
          <Chrono weather={weather} />
          <Atmosphere weather={weather} fallback={o.outside} compact>
            <AirChips o={o} uv={web?.current.uv ?? null} uvMax={web?.daily[0]?.uvMax ?? null} />
          </Atmosphere>
        </div>
        <Center o={o} energy={energy} framed />
        {items.length > 0 && (
          <div className="nx-duo">
            <div className="nx-col">{cols[0]}</div>
            <div className="nx-col">{cols[1]}</div>
          </div>
        )}
        <EnergyStrip energy={energy} />
      </div>
    </div>
  );
}

export function NexusDashboard({ fill = false }: { fill?: boolean }) {
  const o = useOverview();
  const energy = useEnergy();
  const { data: weather } = useWeatherData();
  const hasScenes = useStore((s) => (s.config?.scenes.length ?? 0) > 0);
  const portraitFill = usePortrait() && fill;
  if (portraitFill) return <NexusTall o={o} energy={energy} weather={weather} />;
  const bottom = Number(energy.enabled) + Number(hasScenes);
  return (
    <div className={`nx ${fill ? 'nx-fill' : ''}`}>
      <div className="nx-grid">
        <div className="nx-col nx-left">
          <Chrono weather={weather} />
          <Hints o={o} energy={energy} max={fill ? 2 : 3} />
          <NowPlaying compact={false} />
          <Climate o={o} />
        </div>
        <Center o={o} energy={energy} />
        <div className="nx-col nx-right">
          <Atmosphere weather={weather} fallback={o.outside} compact={fill} />
          <Security o={o} fill={fill} />
          <Print fill={fill} compact={false} />
          <Lights o={o} compact={false} />
        </div>
        <div className={`nx-bottom ${bottom === 2 ? 'two' : ''}`}>
          <KioskSensorsPanel compact className="col-span-full" />
          <EnergyStrip energy={energy} />
          <Scenes />
        </div>
      </div>
    </div>
  );
}
