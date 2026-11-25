/**
 * Mower page ("Mähroboter"): live map of the current session, state, progress and battery, the commands
 * (start, pause, resume, back to the station) plus maintenance (status refresh, reset the map, determine the
 * charging station again) and details. The values come from the device's ioBroker datapoints, typically those
 * of the navimow adapter (Segway Navimow); several mowers are switched with chips in the header.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CloudOff, Eraser, Expand, MapPinOff, RefreshCw, TriangleAlert, X } from 'lucide-react';
import { isOn, useStateValues } from '../lib/store';
import { useDevices } from '../lib/selectors';
import { useNow } from '../lib/hooks';
import { LawnMower } from '../lib/icons';
import { clockTime, num, timeAgo } from '../lib/format';
import { MAINTENANCE_LABELS, areaText, isDocked, mowerStatus, parsePoint, parseTrack } from '../lib/mower';
import type { Device } from '../lib/types';
import { ArcGauge, LiquidGauge, toneStyle } from '../components/Hud';
import { Empty, Modal, OpenSettingsButton, PageHeader, Panel, Rise, Stagger } from '../components/ui';
import { MAP_COLORS, MowerCommandButtons, MowerMap, MowerStateChip, hasMapData, msOrNull, numOrNull, useMowerCommand } from '../components/Mower';

/** A position counts as live while it is younger than this (the mower reports about every two seconds). */
const LIVE_MS = 30_000;

/** Button that asks once more before it acts (the second tap within four seconds confirms). */
function ConfirmButton({ icon, label, question, busy, onConfirm }: { icon: ReactNode; label: string; question: string; busy: boolean; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={`btn ${armed ? 'danger' : ''}`}
      aria-busy={busy}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        onConfirm();
      }}
    >
      {icon}
      {armed ? question : label}
    </button>
  );
}

/** Small key figure (label above, value below). */
function Fact({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-2xl p-3 border border-line bg-[color-mix(in_srgb,var(--fg)_5%,transparent)] min-w-0">
      <div className="text-[0.7rem] uppercase tracking-wider text-muted truncate">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums truncate">{value}</div>
      {sub && <div className="text-xs text-muted truncate">{sub}</div>}
    </div>
  );
}

/** Legend entry of the map. */
function Key({ color, label, round = true }: { color: string; label: string; round?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <i className={`inline-block w-2.5 h-2.5 ${round ? 'rounded-full' : 'rounded-[3px]'}`} style={{ background: color }} />
      {label}
    </span>
  );
}

/** Map with legend and a button for the large view. */
function MapCard({ d, v, onExpand }: { d: Device; v: Record<string, unknown>; onExpand: () => void }) {
  const now = useNow(5000);
  const located = msOrNull(v.positionTime);
  const live = located !== null && now - located < LIVE_MS;
  const status = mowerStatus(v.state);
  const mapped = ['track', 'frame', 'x', 'y'].some((k) => d.states[k]);
  const data = hasMapData(v);
  return (
    <Panel
      title="Karte"
      right={
        <div className="flex items-center gap-2">
          {live && <span className="chip on !cursor-default" style={toneStyle(status.color)}><i className="w-1.5 h-1.5 rounded-full bg-white anim-breathe" /> Live</span>}
          {data && <button type="button" className="btn btn-icon" onClick={onExpand} aria-label="Karte groß anzeigen"><Expand size={16} /></button>}
        </div>
      }
    >
      {data ? (
        <>
          <button type="button" className="mower-ground block w-full p-0 cursor-zoom-in" onClick={onExpand} aria-label="Karte groß anzeigen">
            <MowerMap d={d} values={v} className="mower-map-page" />
          </button>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-muted">
            <Key color={MAP_COLORS.swath} label="Gemäht (diese Sitzung)" round={false} />
            <Key color={MAP_COLORS.start} label="Start" />
            <Key color={status.color} label="Mäher" round={false} />
            {d.states.station && <Key color={MAP_COLORS.station} label="Ladestation" round={false} />}
            {located !== null && <span className="ml-auto">Position {timeAgo(located)}</span>}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted">
          {mapped
            ? 'Noch keine Kartendaten. Die Karte füllt sich, sobald der Mäher fährt.'
            : 'Für die Karte die Datenpunkte Position, Fahrspur und Kartenausschnitt zuordnen. Im navimow-Adapter dazu die Karte (mapEnabled) einschalten.'}
        </p>
      )}
    </Panel>
  );
}

/** State, progress, battery and mowed areas. */
function StatusCard({ d, v }: { d: Device; v: Record<string, unknown> }) {
  const status = mowerStatus(v.state);
  const track = useMemo(() => parseTrack(v.track), [v.track]);
  const progress = numOrNull(v.progress) ?? track?.percentage ?? null;
  const area = numOrNull(v.area) ?? track?.area ?? null;
  const battery = numOrNull(v.battery);
  const charging = status.activity === 'charging' || (isDocked(status.activity) && battery !== null && battery < 100);
  const showProgress = Boolean(d.states.progress || d.states.track);
  return (
    <Panel title="Zustand" className="h-full">
      {(showProgress || d.states.battery) && (
        <div className="grid grid-cols-2 gap-3 justify-items-center">
          {showProgress && <div className="w-full max-w-[10rem]"><ArcGauge value={progress} max={100} unit="%" colors={['#0ea5e9', status.color]} label="Fortschritt" /></div>}
          {d.states.battery && <div className="w-full max-w-[10rem]"><LiquidGauge percent={battery} color={battery !== null && battery <= 20 ? '#f43f5e' : '#34d399'} charging={charging} label={charging ? 'Akku · lädt' : 'Akku'} /></div>}
        </div>
      )}
      {(d.states.area || d.states.weekArea || area !== null) && (
        <div className="grid grid-cols-2 gap-2.5 mt-4">
          <Fact label="Diese Sitzung" value={areaText(area)} sub={progress !== null ? `${num(progress, 0)} % der Fläche` : undefined} />
          {d.states.weekArea && <Fact label="Diese Woche" value={areaText(numOrNull(v.weekArea))} />}
        </div>
      )}
    </Panel>
  );
}

/** Start / pause / resume / back to the station (beside the state on narrow pages, so the map moves up). */
function ControlsCard({ d, v }: { d: Device; v: Record<string, unknown> }) {
  const status = mowerStatus(v.state);
  const hasCommands = ['start', 'pause', 'resume', 'home'].some((k) => d.states[k]);
  return (
    <Panel title="Steuerung" className="h-full flex flex-col">
      {hasCommands ? (
        <MowerCommandButtons d={d} activity={status.activity} fill />
      ) : (
        <p className="text-sm text-muted">Keine Knöpfe zugeordnet. Unter Einstellungen → Geräte die Datenpunkte für Start, Pause, Fortsetzen und Zur Station eintragen.</p>
      )}
    </Panel>
  );
}

/** Status refresh, map reset and determining the charging station again, with a note on the delay of the cloud. */
function MaintenanceCard({ d }: { d: Device }) {
  const { busy, send } = useMowerCommand(d);
  const hasMaintenance = ['refresh', 'resetMap', 'station'].some((k) => d.states[k]);
  const hasCommands = ['start', 'pause', 'resume', 'home'].some((k) => d.states[k]);
  if (!hasMaintenance && !hasCommands) return null;
  return (
    <Panel title="Wartung">
      {hasMaintenance && (
        <div className="flex flex-wrap gap-2 mb-4">
          {d.states.refresh && (
            <button type="button" className="btn" aria-busy={busy === 'refresh'} onClick={() => send('refresh', MAINTENANCE_LABELS.refresh)}>
              <RefreshCw size={15} className={busy === 'refresh' ? 'anim-spin-fast anim-loader' : ''} /> {MAINTENANCE_LABELS.refresh}
            </button>
          )}
          {d.states.resetMap && (
            <ConfirmButton icon={<Eraser size={15} />} label={MAINTENANCE_LABELS.resetMap} question="Wirklich zurücksetzen?" busy={busy === 'resetMap'} onConfirm={() => send('resetMap', MAINTENANCE_LABELS.resetMap)} />
          )}
          {d.states.station && (
            <ConfirmButton
              icon={<MapPinOff size={15} />}
              label={MAINTENANCE_LABELS.station}
              question="Station vergessen?"
              busy={busy === 'station'}
              onConfirm={() => send('station', MAINTENANCE_LABELS.station, '')}
            />
          )}
        </div>
      )}
      <p className="text-xs text-muted leading-relaxed">
        Befehle gehen über die Navimow-Cloud an den Mäher; der Zustand folgt mit bis zu einer Minute Verzögerung.
        {d.states.station && ' Eine vergessene Ladestation bestimmt der Adapter beim nächsten Andocken neu.'}
      </p>
    </Panel>
  );
}

/** Raw state, model, firmware, times, position and the cloud connection. */
function DetailsCard({ d, v }: { d: Device; v: Record<string, unknown> }) {
  useNow(15000);
  const updated = msOrNull(v.updated);
  const located = msOrNull(v.positionTime);
  const x = numOrNull(v.x);
  const y = numOrNull(v.y);
  const station = parsePoint(v.station);
  const at = (t: number) => `${clockTime(t)} (${timeAgo(t)})`;
  const rows: [string, string][] = [];
  if (v.state != null && v.state !== '') rows.push(['Zustand (Adapter)', String(v.state)]);
  if (v.model) rows.push(['Modell', String(v.model)]);
  if (v.firmware) rows.push(['Firmware', String(v.firmware)]);
  if (updated) rows.push(['Letzte Statusmeldung', at(updated)]);
  if (located) rows.push(['Letzte Position', at(located)]);
  if (x !== null && y !== null) rows.push(['Position', `x ${num(x, 2)} m · y ${num(y, 2)} m`]);
  if (d.states.station) rows.push(['Ladestation', station ? `x ${num(station.x, 2)} m · y ${num(station.y, 2)} m` : 'noch unbekannt (wird beim Andocken bestimmt)']);
  if (d.states.online) rows.push(['Navimow-Cloud', isOn(v.online) ? 'verbunden' : 'getrennt']);
  if (!rows.length) return null;
  return (
    <Panel title="Details">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
        {rows.map(([k, val]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="break-words">{val}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

/** Hint above the cards: no cloud connection, or a state that needs attention (lifted, error). */
function Problem({ d, v }: { d: Device; v: Record<string, unknown> }) {
  const status = mowerStatus(v.state);
  const offline = Boolean(d.states.online) && !isOn(v.online);
  if (!offline && !status.problem) return null;
  const [title, text] = offline
    ? ['Keine Verbindung zur Navimow-Cloud', 'Der ioBroker-Adapter navimow ist nicht mit der Cloud verbunden: Werte können veraltet sein und Befehle kommen nicht an. Im ioBroker die Instanz prüfen und bei Bedarf neu anmelden.']
    : status.activity === 'lifted'
      ? ['Mäher angehoben', 'Der Mäher meldet, dass er angehoben wurde. Bitte vor Ort nachsehen und ihn wieder absetzen.']
      : [`Mäher meldet: ${status.label}`, 'Bitte den Mäher in der Navimow-App oder vor Ort prüfen.'];
  return (
    <div className="glass tile tone-alert active p-4 mb-4 flex items-start gap-3" role="status">
      <div className="icon-bubble on">{offline ? <CloudOff size={20} /> : <TriangleAlert size={20} />}</div>
      <div className="min-w-0">
        <div className="font-semibold">{title}</div>
        <p className="text-sm text-muted mt-0.5">{text}</p>
      </div>
    </div>
  );
}

/** Page content of one mower. */
function MowerPanels({ d, chooser }: { d: Device; chooser: ReactNode }) {
  const v = useStateValues(d.states);
  const [big, setBig] = useState(false);
  useNow(30000);
  const updated = msOrNull(v.updated);
  const subtitle = [v.model ? `Modell ${String(v.model)}` : null, updated ? `Status ${timeAgo(updated)}` : null].filter(Boolean).join(' · ') || undefined;
  // two columns only when the page itself is wide enough (map | state, controls, maintenance, details); below,
  // state and controls side by side above the map (from about 32rem, e.g. a 1200×1920 display at DPR 2),
  // on phones everything in one column: state, controls, map, maintenance, details
  const col = 'contents @5xl:flex flex-col gap-4 min-w-0';
  const wide = 'min-w-0 @lg:col-span-2 @5xl:col-span-1 @5xl:order-none';
  return (
    <div className="@container">
      <PageHeader title={d.name} subtitle={subtitle}>
        {chooser}
        <MowerStateChip value={v.state} />
      </PageHeader>
      <Problem d={d} v={v} />
      <Stagger className="grid gap-4 @lg:grid-cols-2 @5xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] @5xl:items-start">
        <Rise className={col}>
          <div className={`order-3 ${wide}`}><MapCard d={d} v={v} onExpand={() => setBig(true)} /></div>
        </Rise>
        <Rise className={col}>
          <div className="min-w-0 order-1 @5xl:order-none"><StatusCard d={d} v={v} /></div>
          <div className="min-w-0 order-2 @5xl:order-none"><ControlsCard d={d} v={v} /></div>
          <div className={`order-4 ${wide}`}><MaintenanceCard d={d} /></div>
          <div className={`order-5 ${wide}`}><DetailsCard d={d} v={v} /></div>
        </Rise>
      </Stagger>
      <Modal open={big} onClose={() => setBig(false)} wide zoom>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold flex-1 truncate">{d.name}</h2>
            <MowerStateChip value={v.state} />
            <button type="button" className="btn btn-icon" onClick={() => setBig(false)} aria-label="Schließen"><X size={18} /></button>
          </div>
          <div className="mower-ground"><MowerMap d={d} values={v} className="mower-map-large" /></div>
        </div>
      </Modal>
    </div>
  );
}

/** Page of the robotic mowers. */
export function MowerView() {
  const devices = useDevices();
  const mowers = useMemo(() => devices.filter((d) => d.type === 'mower'), [devices]);
  const [selected, setSelected] = useState<string | null>(null);
  const d = mowers.find((m) => m.id === selected) ?? mowers[0];
  if (!d) {
    return (
      <div>
        <PageHeader title="Mähroboter" />
        <Empty
          icon={<LawnMower size={28} />}
          title="Kein Mähroboter eingerichtet"
          text="Lege unter Einstellungen → Geräte einen Mähroboter an. Mit dem ioBroker-Adapter navimow trägt „Aus navimow übernehmen“ alle Datenpunkte automatisch ein."
        >
          <OpenSettingsButton />
        </Empty>
      </div>
    );
  }
  const chooser = mowers.length > 1 && (
    <div className="flex flex-wrap gap-2">
      {mowers.map((m) => (
        <button key={m.id} type="button" className={`chip ${m.id === d.id ? 'on' : ''}`} onClick={() => setSelected(m.id)} aria-pressed={m.id === d.id}>
          {m.name}
        </button>
      ))}
    </div>
  );
  return <MowerPanels key={d.id} d={d} chooser={chooser} />;
}
