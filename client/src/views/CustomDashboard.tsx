/**
 * Freely designable start page ("Eigene", chosen per device under Einstellungen → Anzeige): widgets
 * placed in a grid of 12 columns with rows of fixed height. The layout is stored on the server (see
 * lib/widgets.ts and server dashboard.js), so every device with this design shows the same page.
 *
 * - Large screens: the grid as designed. Phones: the widgets one below the other in reading order.
 * - Kiosk mode: the rows share the height of the screen, so the page fits without scrolling.
 * - Widgets that are larger than their content enlarge it (ScaleUp in components/Hud.tsx; can be
 *   switched off per widget). Gauges, Home Core, camera pictures and the radar fill their area anyway.
 * - Single parts of the weather and energy pages are widgets of their own ("Wetter-Detail",
 *   "Energie-Detail"); lights and switches can be shown as small tiles.
 * - Editing: "Bearbeiten" (or Einstellungen → Anzeige) shows the grid. Widgets are moved at their grip
 *   and resized at the corner (mouse, touch, or keyboard: arrow keys move, Shift + arrow keys resize);
 *   widgets in the way move down. ⚙ opens the widget's settings incl. exact position and size. The
 *   draft is kept while switching pages and only saved with "Speichern".
 */
import { useContext, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import {
  Activity, AirVent, Camera, Clock3, CloudSun, DoorOpen, Gauge, GripVertical, House, LayoutDashboard, LayoutTemplate, Lightbulb, MoveDiagonal2, Music, Pencil, Plus, Power, Printer3d, Puzzle, Save,
  Recycle, Settings2, Shield, Sparkles, ToggleRight, Trash2, Type, Umbrella, Wind, X, Zap, type LucideIcon,
} from 'lucide-react';
import { useStore } from '../lib/store';
import { activeExtensions } from '../lib/extensions';
import { useKioskLayout, useKioskScale, useMedia } from '../lib/display';
import { useElementSize } from '../lib/hooks';
import { greeting, num, power } from '../lib/format';
import type { Device } from '../lib/types';
import { switchAllOff } from '../lib/selectors';
import { useOverview, type Overview } from '../lib/overview';
import {
  GRID_COLS, MAX_HEIGHT, MAX_WIDGETS, WIDGETS, WIDGET_PARTS, WIDGET_TYPES, addWidget, gridRows, normalizeDashboard, placeWidget, readingOrder, scalesContent,
  templateWidgets, widgetPart, type GridRect, type Widget, type WidgetOptions, type WidgetPart, type WidgetType,
} from '../lib/widgets';
import { BatteryBar, IDLE_W, useEnergy, useEnergySeries, type EnergyValues } from '../components/Energy';
import { DeviceCardSized } from '../components/DeviceCards';
import { AreaChart, Legend } from '../components/Charts';
import { HudPanel, HudScale, ScaleUp } from '../components/Hud';
import { WeatherPart } from '../components/Weather';
import { PrinterPanel } from '../components/Printer';
import { SpotifyPanel, useSpotifyOnDashboard } from '../components/Spotify';
import { WastePanel } from '../components/Waste';
import { VentilationPanel } from '../components/Ventilation';
import { KioskSensorsPanel } from '../components/KioskSensors';
import { ExtensionWidgetBody } from '../components/Extension';
import { Empty, Modal } from '../components/ui';
import { Field, NumInput, Switch } from './settings/shared';
import {
  C, EnergyPanel, HeroClock, HeroWeather, HouseCore, HudCamera, RoomMatrix, RoomPod, ScenePanel, SecurityPanel, StatusChips, useGaugeTiles, useHouseState,
} from './Dashboard';

/** Height of a grid row and gap between the cells (px). */
const BASE_ROW = 64;
const BASE_GAP = 16;
/** Empty rows below the last widget while editing, so widgets can be dragged further down. */
const EDIT_SPARE_ROWS = 4;

const ICONS: Record<WidgetType, LucideIcon> = {
  clock: Clock3, status: House, weather: CloudSun, weatherPart: Umbrella, gauge: Gauge, energy: Zap, energyPart: Activity, security: Shield, camera: Camera,
  rooms: LayoutDashboard, room: DoorOpen, scenes: Sparkles, lights: Lightbulb, devices: ToggleRight, text: Type, printer: Printer3d, spotify: Music,
  waste: Recycle, ventilation: AirVent, kiosk: Wind, extension: Puzzle,
};

/** Smallest row height (px) at which the kiosk layout still squeezes all rows onto the screen; otherwise it scrolls. */
const BASE_MIN_FIT_ROW = 40;
/** Gap between the cells in the kiosk layout (px). */
const BASE_FIT_GAP = 12;

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Name of a widget in the editor: the chosen part (gauge, weather or energy detail), the own title or the module name, otherwise the name of the widget type. */
const widgetLabel = (w: Widget) =>
  widgetPart(w)?.label
  || ((w.type === 'devices' || w.type === 'text') && str(w.options.title))
  || (w.type === 'extension' && useStore.getState().extensions.find((m) => m.id === str(w.options.extension))?.name)
  || WIDGETS[w.type].label;

/** Light and switch tiles in the chosen size; with `small` the small tiles come first in their own denser grid. */
function DeviceGrid({ devices, small }: { devices: Device[]; small: boolean }) {
  if (!small) return <div className="grid-cards">{devices.map((d) => <DeviceCardSized key={d.id} device={d} small={false} />)}</div>;
  const isSmall = (d: Device) => d.type === 'light' || d.type === 'switch';
  const tiles = devices.filter(isSmall);
  const cards = devices.filter((d) => !isSmall(d));
  return (
    <>
      {tiles.length > 0 && <div className="grid-switches">{tiles.map((d) => <DeviceCardSized key={d.id} device={d} small />)}</div>}
      {cards.length > 0 && <div className={`grid-cards ${tiles.length ? 'mt-3' : ''}`}>{cards.map((d) => <DeviceCardSized key={d.id} device={d} small={false} />)}</div>}
    </>
  );
}

/* ------------------------------------------------------------------ widgets */

/** Panel with a short hint, for widgets whose data is missing (e.g. no energy system configured). */
function WidgetNote({ type, title, text }: { type: WidgetType; title?: string; text: string }) {
  const I = ICONS[type];
  return (
    <HudPanel title={title ?? WIDGETS[type].label} color={C.violet} bodyClassName="flex items-center gap-2 text-sm text-muted">
      <I size={16} className="shrink-0" /> {text}
    </HudPanel>
  );
}

function ClockWidget({ o, energy, chips }: { o: Overview; energy: EnergyValues; chips: boolean }) {
  const today = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <HudPanel color={C.cyan}>
      <HeroClock compact />
      <p className="text-sm mt-2 truncate">
        <b>{greeting()}</b> <span className="text-muted capitalize">· {today}</span>
      </p>
      {chips && <StatusChips o={o} energy={energy} max={4} />}
    </HudPanel>
  );
}

function StatusWidget() {
  const { state, color } = useHouseState();
  return (
    <HudPanel color={color} alert={state === 'ok' ? null : state} bodyClassName="cdash-fit grid place-items-center">
      <HouseCore size="min(100cqw, 100cqh, 18.125rem)" />
    </HudPanel>
  );
}

function GaugeWidget({ o, energy, w }: { o: Overview; energy: EnergyValues; w: Widget }) {
  const tile = useGaugeTiles(o, energy, true).find((t) => t.key === w.options.kind);
  const label = widgetPart(w)?.label ?? 'Messinstrument';
  return tile ?? <WidgetNote type="gauge" title={label} text="Für dieses Messinstrument fehlen die Daten." />;
}

function LightsWidget({ o, small }: { o: Overview; small: boolean }) {
  const set = useStore((s) => s.set);
  return (
    <HudPanel
      title="Eingeschaltet"
      color={C.amber}
      right={o.lightsOn.length > 0 && <button className="btn !py-1 !text-xs" onClick={() => switchAllOff(o.lightsOn, set)}><Power size={12} /> Alle aus</button>}
    >
      {o.lightsOn.length ? (
        <DeviceGrid devices={o.lightsOn} small={small} />
      ) : (
        <p className="text-sm text-muted">{o.lights.length ? 'Alle Lichter sind aus.' : 'Keine Lichter eingerichtet.'}</p>
      )}
    </HudPanel>
  );
}

function DevicesWidget({ o, w }: { o: Overview; w: Widget }) {
  const byId = new Map(o.devices.map((d) => [d.id, d]));
  const devices = ids(w.options.devices).map((id) => byId.get(id)).filter((d) => d != null);
  const title = str(w.options.title) || 'Geräte';
  if (!devices.length) return <WidgetNote type="devices" title={title} text="Noch keine Geräte gewählt (⚙ beim Bearbeiten)." />;
  return (
    <HudPanel title={title} color={C.violet}>
      <DeviceGrid devices={devices} small={Boolean(w.options.compact)} />
    </HudPanel>
  );
}

function TextWidget({ w }: { w: Widget }) {
  const title = str(w.options.title);
  return (
    <HudPanel title={title || undefined} color={C.violet}>
      <p className="text-sm whitespace-pre-wrap break-words">{str(w.options.text)}</p>
    </HudPanel>
  );
}

/** Large value of an energy detail with unit and an optional line below. */
function EnergyValue({ value, unit, sub, children }: { value: string; unit: string; sub?: string; children?: ReactNode }) {
  return (
    <div>
      <div className="text-4xl font-bold tracking-tight tabular-nums leading-none hud-glow-text whitespace-nowrap">
        {value}<span className="text-base text-muted font-semibold ml-1">{unit}</span>
      </div>
      {sub && <div className="text-xs text-muted mt-1.5 truncate">{sub}</div>}
      {children}
    </div>
  );
}

/** One figure or history curve of the energy page (`part`: see ENERGY_PARTS in lib/widgets.ts). */
function EnergyPartWidget({ energy: e, w }: { energy: EnergyValues; w: Widget }) {
  const part = str(w.options.part);
  const chart = part.startsWith('chart');
  const series = useEnergySeries(chart ? 24 : 0);
  const label = widgetPart(w)?.label ?? WIDGETS.energyPart.label;
  if (!e.enabled) return <WidgetNote type="energyPart" title={label} text="Kein Energiesystem eingerichtet." />;
  const missing = <WidgetNote type="energyPart" title={label} text="Für diese Anzeige fehlt der Datenpunkt (Einstellungen → Energie)." />;
  const kw = (v: number) => num(v / 1000, 1);
  if (chart) {
    const list = part === 'chartPower' ? series.power : part === 'chartFlow' ? series.flow : series.soc;
    if (!list.length) return missing;
    return (
      <HudPanel title={label} color={C.cyan} right={list.length > 1 ? <Legend items={list} /> : '24 h'}>
        {list.some((s) => s.data.length > 1) ? (
          part === 'chartSoc' ? <AreaChart series={list} unit="%" height={160} format={(v) => `${Math.round(v)}`} /> : <AreaChart series={list} unit="kW" format={kw} />
        ) : (
          <p className="text-sm text-muted">Noch kein Verlauf vorhanden.</p>
        )}
      </HudPanel>
    );
  }
  const pct = (v: number | null, color: string, sub?: string) =>
    v == null ? missing : <HudPanel title={label} color={color}><EnergyValue value={num(v, 0)} unit="%" sub={sub} /></HudPanel>;
  switch (part) {
    case 'production': {
      const p = power(e.pv);
      return <HudPanel title={label} color={C.solar}><EnergyValue {...p} sub={e.dailyYield != null ? `Heute ${num(e.dailyYield, 1)} kWh` : undefined} /></HudPanel>;
    }
    case 'consumption': {
      const p = power(e.home);
      return <HudPanel title={label} color={C.violet}><EnergyValue {...p} sub="Hausverbrauch" /></HudPanel>;
    }
    case 'grid': {
      if (!e.hasGrid) return missing;
      const p = power(Math.abs(e.grid));
      return <HudPanel title={label} color={C.cyan}><EnergyValue {...p} sub={e.grid > IDLE_W ? 'Netzbezug' : e.grid < -IDLE_W ? 'Einspeisung' : 'Ausgeglichen'} /></HudPanel>;
    }
    case 'battery': {
      if (!e.hasBattery && e.soc == null) return missing;
      const charging = e.battery < -IDLE_W;
      const p = power(Math.abs(e.battery));
      const state = charging ? 'lädt' : e.battery > IDLE_W ? 'entlädt' : 'Ruhezustand';
      return (
        <HudPanel title={label} color={C.green}>
          {e.soc != null ? (
            <EnergyValue value={num(e.soc, 0)} unit="%" sub={e.hasBattery ? `${state}${state === 'Ruhezustand' ? '' : ` · ${p.value} ${p.unit}`}` : undefined}>
              <div className="mt-2"><BatteryBar soc={e.soc} charging={charging} /></div>
            </EnergyValue>
          ) : (
            <EnergyValue {...p} sub={state} />
          )}
        </HudPanel>
      );
    }
    case 'autarky':
      return pct(e.autarky, C.green, 'Anteil aus eigener Erzeugung');
    case 'selfConsumption':
      return pct(e.selfConsumption, C.cyan, 'Selbst genutzter Solarstrom');
    default:
      return <WidgetNote type="energyPart" title={label} text="Unbekannte Anzeige – bitte über ⚙ neu wählen." />;
  }
}

/** Content of one widget. */
function WidgetView({ w, o, energy }: { w: Widget; o: Overview; energy: EnergyValues }) {
  const cameras = useStore((s) => s.cameras);
  const scenes = useStore((s) => s.config?.scenes.length ?? 0);
  const printer = useStore((s) => Boolean(s.printer?.enabled));
  const modules = useStore((s) => s.config?.modules);
  const scale = useContext(HudScale);
  if ((w.type === 'weather' || w.type === 'weatherPart') && modules?.weather === false) return <WidgetNote type={w.type} text="Das Wettermodul ist deaktiviert." />;
  if (w.type === 'printer' && modules?.printer === false) return <WidgetNote type="printer" text="Das Druckermodul ist deaktiviert." />;
  if (w.type === 'spotify' && modules?.spotify === false) return <WidgetNote type="spotify" text="Das Spotify-Modul ist deaktiviert." />;
  switch (w.type) {
    case 'clock':
      return <ClockWidget o={o} energy={energy} chips={w.options.chips !== false} />;
    case 'status':
      return <StatusWidget />;
    case 'weather':
      return (
        <HudPanel title="Wetter" color={C.cyan}>
          <HeroWeather fallback={o.outside} compact />
        </HudPanel>
      );
    case 'weatherPart':
      return <WeatherPart part={str(w.options.part)} label={widgetPart(w)?.label ?? WIDGETS.weatherPart.label} />;
    case 'gauge':
      return <GaugeWidget o={o} energy={energy} w={w} />;
    case 'energy':
      return energy.enabled ? <EnergyPanel energy={energy} compact={!w.options.chart} /> : <WidgetNote type="energy" text="Kein Energiesystem eingerichtet." />;
    case 'energyPart':
      return <EnergyPartWidget energy={energy} w={w} />;
    case 'security':
      return <SecurityPanel contacts={o.contacts} />;
    case 'camera': {
      const cam = cameras.find((c) => c.id === str(w.options.camera)) ?? (w.options.camera ? undefined : cameras[0]);
      return cam ? <HudCamera cam={cam} /> : <WidgetNote type="camera" text="Kamera nicht gefunden." />;
    }
    case 'rooms':
      return o.rooms.length ? <RoomMatrix rooms={o.rooms} /> : <WidgetNote type="rooms" text="Noch keine Räume eingerichtet." />;
    case 'room': {
      const r = o.rooms.find((x) => x.room.id === str(w.options.room)) ?? (w.options.room ? undefined : o.rooms[0]);
      if (!r) return <WidgetNote type="room" text="Raum nicht gefunden." />;
      // the room card is not a HUD panel: the whole card grows
      return scale ? <ScaleUp stretch><RoomPod r={r} /></ScaleUp> : <RoomPod r={r} />;
    }
    case 'scenes':
      return scenes ? <ScenePanel /> : <WidgetNote type="scenes" text="Noch keine Szenen eingerichtet." />;
    case 'lights':
      return <LightsWidget o={o} small={Boolean(w.options.compact)} />;
    case 'devices':
      return <DevicesWidget o={o} w={w} />;
    case 'text':
      return <TextWidget w={w} />;
    case 'printer':
      return printer ? <PrinterPanel webcam={w.options.webcam !== false} /> : <WidgetNote type="printer" text="Kein 3D-Drucker eingerichtet (Einstellungen → 3D-Drucker)." />;
    case 'spotify':
      return <SpotifyWidget />;
    case 'waste':
      return <WastePanel count={typeof w.options.count === 'number' ? w.options.count : 4} />;
    case 'ventilation':
      return <VentilationPanel />;
    case 'kiosk':
      return <KioskSensorsPanel showEmpty />;
    case 'extension':
      return <ExtensionWidget w={w} />;
  }
}

/** Widget of an external module: its cards or its own page in the sandbox. */
function ExtensionWidget({ w }: { w: Widget }) {
  const id = str(w.options.extension);
  const manifest = useStore((s) => s.extensions.find((m) => m.id === id));
  return (
    <HudPanel title={manifest?.name ?? WIDGETS.extension.label} color={C.violet} bodyClassName={manifest?.widget?.entry ? 'flex flex-col' : ''}>
      <ExtensionWidgetBody id={id} note={(text) => <div className="flex items-center gap-2 text-sm text-muted"><Puzzle size={16} className="shrink-0" /> {text}</div>} />
    </HudPanel>
  );
}

/** Mini player while music plays; otherwise the cell stays empty (a hint while editing, so it can be placed). */
function SpotifyWidget() {
  const show = useSpotifyOnDashboard();
  const editing = useStore((s) => s.dashboardDraft !== null);
  if (show) return <SpotifyPanel />;
  return editing ? <WidgetNote type="spotify" text="Erscheint nur, solange Musik läuft." /> : null;
}

/* ------------------------------------------------------------------ editor */

/**
 * Catalogue of the widgets; a click adds one at the first free place. Widgets with parts (gauges,
 * weather and energy details) also list their parts, so a single part can be added directly; the
 * entry "Externes Modul" lists the enabled external modules that bring a widget.
 */
function AddDialog({ open, onClose, onAdd, full }: { open: boolean; onClose: () => void; onAdd: (type: WidgetType, options?: WidgetOptions, size?: [number, number]) => void; full: boolean }) {
  const modules = useWidgetModules();
  return (
    <Modal open={open} onClose={onClose} title="Widget hinzufügen" wide>
      {full && <p className="text-sm text-rose-400 mb-3">Die Startseite hat bereits {MAX_WIDGETS} Widgets.</p>}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {WIDGET_TYPES.filter((t) => t !== 'extension' || modules.length > 0).map((t) => {
          const I = ICONS[t];
          const parts: { option: string; label: string; parts: readonly WidgetPart[] } | undefined = t === 'extension'
            ? { option: 'extension', label: 'Modul', parts: modules.map((m) => ({ id: m.id, label: m.name, size: m.widget?.size ?? WIDGETS.extension.size })) }
            : WIDGET_PARTS[t];
          return (
            <div key={t} className={`rounded-2xl border border-line hover:border-violet-400/50 transition ${parts ? 'sm:col-span-2 lg:col-span-3' : ''}`}>
              <button className="w-full text-left p-3 flex gap-3 disabled:opacity-50" disabled={full} onClick={() => onAdd(t)}>
                <div className="icon-bubble on tone-violet !w-9 !h-9 shrink-0"><I size={17} /></div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm">{WIDGETS[t].label}</div>
                  <p className="text-xs text-muted mt-0.5">{WIDGETS[t].text}</p>
                </div>
              </button>
              {parts && (
                <div className="flex flex-wrap gap-1.5 px-3 pb-3 -mt-1" role="group" aria-label={`${WIDGETS[t].label}: direkt hinzufügen`}>
                  {parts.parts.map((p) => (
                    <button key={p.id} className="chip !text-xs disabled:opacity-50" disabled={full} onClick={() => onAdd(t, { [parts.option]: p.id }, t === 'extension' ? p.size : undefined)}>
                      <Plus size={12} /> {p.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

/** Enabled external modules that bring a widget for the start page. */
function useWidgetModules() {
  const extensions = useStore((s) => s.extensions);
  const all = useStore((s) => s.config?.extensions);
  return useMemo(() => activeExtensions(extensions, all).filter((m) => m.widget), [extensions, all]);
}

/** Settings of one widget: its own options plus exact position and size. */
function WidgetSettings({ w, o, onChange, onPlace, onClose }: {
  w: Widget; o: Overview; onChange: (options: WidgetOptions) => void; onPlace: (r: GridRect) => void; onClose: () => void;
}) {
  const cameras = useStore((s) => s.cameras);
  const modules = useWidgetModules();
  const setOpt = (p: WidgetOptions) => onChange({ ...w.options, ...p });
  const [minW, minH] = WIDGETS[w.type].min;
  const parts = WIDGET_PARTS[w.type];
  const roomName = new Map(o.rooms.map((r) => [r.room.id, r.room.name]));
  const chosen = ids(w.options.devices);
  return (
    <Modal open onClose={onClose} title={WIDGETS[w.type].label}>
      <div className="grid gap-4">
        {w.type === 'clock' && <Switch label="Statusmeldungen anzeigen" checked={w.options.chips !== false} onChange={(v) => setOpt({ chips: v })} />}
        {w.type === 'energy' && <Switch label="Verlauf der letzten 24 Stunden anzeigen" checked={Boolean(w.options.chart)} onChange={(v) => setOpt({ chart: v })} />}
        {w.type === 'printer' && <Switch label="Webcam-Bild anzeigen" checked={w.options.webcam !== false} onChange={(v) => setOpt({ webcam: v })} />}
        {w.type === 'waste' && (
          <Field label="Anzahl der Abholtage">
            <NumInput value={typeof w.options.count === 'number' ? w.options.count : 4} onChange={(v) => setOpt({ count: Math.min(12, Math.max(1, Math.round(v ?? 4))) })} />
          </Field>
        )}
        {parts && (
          <Field label={parts.label}>
            <select className="field" value={str(w.options[parts.option])} onChange={(e) => setOpt({ [parts.option]: e.target.value })}>
              {parts.parts.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          </Field>
        )}
        {w.type === 'camera' && (
          <Field label="Kamera">
            <select className="field" value={str(w.options.camera) || cameras[0]?.id || ''} onChange={(e) => setOpt({ camera: e.target.value })}>
              {cameras.length === 0 && <option value="">Keine Kameras vorhanden</option>}
              {cameras.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        )}
        {w.type === 'room' && (
          <Field label="Raum">
            <select className="field" value={str(w.options.room) || o.rooms[0]?.room.id || ''} onChange={(e) => setOpt({ room: e.target.value })}>
              {o.rooms.length === 0 && <option value="">Keine Räume vorhanden</option>}
              {o.rooms.map((r) => <option key={r.room.id} value={r.room.id}>{r.room.name}</option>)}
            </select>
          </Field>
        )}
        {w.type === 'extension' && (
          <Field label="Externes Modul" hint="Nur aktivierte Module mit Widget (Einstellungen → Module).">
            <select className="field" value={str(w.options.extension)} onChange={(e) => setOpt({ extension: e.target.value })}>
              <option value="">– bitte wählen –</option>
              {str(w.options.extension) && !modules.some((m) => m.id === str(w.options.extension)) && <option value={str(w.options.extension)}>{str(w.options.extension)} (nicht verfügbar)</option>}
              {modules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
        )}
        {(w.type === 'devices' || w.type === 'text') && (
          <Field label="Überschrift">
            <input className="field" value={str(w.options.title)} maxLength={80} placeholder={w.type === 'devices' ? 'Geräte' : ''} onChange={(e) => setOpt({ title: e.target.value })} />
          </Field>
        )}
        {w.type === 'text' && (
          <Field label="Text">
            <textarea className="field min-h-28" value={str(w.options.text)} maxLength={2000} onChange={(e) => setOpt({ text: e.target.value })} />
          </Field>
        )}
        {(w.type === 'lights' || w.type === 'devices') && (
          <Switch label="Kleine Schalter (Lampen und Schalter nur zum Ein- und Ausschalten)" checked={Boolean(w.options.compact)} onChange={(v) => setOpt({ compact: v })} />
        )}
        {scalesContent({ ...w, options: { ...w.options, scale: true } }) && (
          <Switch label="Inhalt an die Widgetgröße anpassen (wird mit dem Widget größer)" checked={w.options.scale !== false} onChange={(v) => setOpt({ scale: v })} />
        )}
        {w.type === 'devices' && (
          <Field label={`Geräte (${chosen.length} gewählt, in Reihenfolge der Auswahl)`}>
            <div className="max-h-64 overflow-y-auto rounded-xl border border-line divide-y divide-[var(--line)]">
              {o.devices.length === 0 && <p className="p-3 text-sm text-muted">Noch keine Geräte eingerichtet.</p>}
              {o.devices.map((d) => (
                <label key={d.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={chosen.includes(d.id)} onChange={(e) => setOpt({ devices: e.target.checked ? [...chosen, d.id] : chosen.filter((x) => x !== d.id) })} />
                  <span className="flex-1 truncate">{d.name}</span>
                  <span className="text-[0.7rem] text-muted truncate">{roomName.get(d.room) ?? ''}</span>
                </label>
              ))}
            </div>
          </Field>
        )}
        <div>
          <div className="lbl">Position und Größe (in Rasterfeldern)</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="Spalte (1–12)"><NumInput value={w.x + 1} onChange={(v) => v != null && onPlace({ ...w, x: v - 1 })} /></Field>
            <Field label="Zeile"><NumInput value={w.y + 1} onChange={(v) => v != null && onPlace({ ...w, y: v - 1 })} /></Field>
            <Field label={`Breite (${minW}–${GRID_COLS})`}><NumInput value={w.w} onChange={(v) => v != null && onPlace({ ...w, w: Math.min(v, GRID_COLS - w.x) })} /></Field>
            <Field label={`Höhe (${minH}–${MAX_HEIGHT})`}><NumInput value={w.h} onChange={(v) => v != null && onPlace({ ...w, h: v })} /></Field>
          </div>
          <p className="text-[0.7rem] text-muted mt-2">Widgets, die im Weg sind, rutschen nach unten. Auf dem Handy stehen die Widgets untereinander in Lesereihenfolge.</p>
        </div>
        <div className="flex justify-end"><button className="btn primary" onClick={onClose}>Fertig</button></div>
      </div>
    </Modal>
  );
}

/** Active pointer gesture of the editor. */
interface Drag {
  id: string;
  kind: 'move' | 'resize';
  x: number;
  y: number;
  rect: GridRect;
  list: Widget[];
  pitchX: number;
  pitchY: number;
  /** Last applied rectangle ("x,y,w,h"), so the layout is only recomputed when the cell changes. */
  last: string;
}

/** Edit controls laid over a widget: grip (move), settings, delete and the resize corner. */
function EditFrame({ w, active, canDrag, onPointerDown, onPointerMove, onPointerUp, onKey, onSettings, onDelete }: {
  w: Widget; active: boolean; canDrag: boolean;
  onPointerDown: (e: PointerEvent<HTMLButtonElement>, kind: Drag['kind']) => void;
  onPointerMove: (e: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: () => void;
  onKey: (e: KeyboardEvent<HTMLButtonElement>) => void;
  onSettings: () => void;
  onDelete: () => void;
}) {
  const label = widgetLabel(w);
  const gesture = { onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onLostPointerCapture: onPointerUp };
  return (
    <div className={`cdash-edit ${active ? 'is-active' : ''}`}>
      <div className="cdash-bar flex items-center gap-1 p-1">
        {canDrag && (
          <button type="button" className="btn !p-2 min-h-9 min-w-9 cursor-grab active:cursor-grabbing touch-none"
            aria-label={`${label} verschieben (Spalte ${w.x + 1}, Zeile ${w.y + 1}, ${w.w} × ${w.h})`}
            title="Ziehen zum Verschieben · Tastatur: Pfeiltasten verschieben, Umschalt + Pfeiltasten ändern die Größe"
            onPointerDown={(e) => onPointerDown(e, 'move')} onKeyDown={onKey} {...gesture}
          ><GripVertical size={16} aria-hidden /></button>
        )}
        <span className="text-xs font-semibold truncate flex-1 min-w-0">{label} <span className="text-muted font-normal">· {w.w} × {w.h}</span></span>
        <button type="button" className="btn !p-2 min-h-9 min-w-9" onClick={onSettings} aria-label={`${label}: Einstellungen`} title="Einstellungen"><Settings2 size={16} /></button>
        <button type="button" className="btn !p-2 min-h-9 min-w-9 danger" onClick={onDelete} aria-label={`${label} entfernen`} title="Entfernen"><Trash2 size={16} /></button>
      </div>
      {canDrag && (
        <button type="button" className="cdash-resize btn !p-1.5 touch-none" aria-label={`${label}: Größe ändern`} title="Ziehen ändert die Größe"
          tabIndex={-1} onPointerDown={(e) => onPointerDown(e, 'resize')} {...gesture}
        ><MoveDiagonal2 size={15} aria-hidden /></button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ page */

/** The freely designable start page; `fill`: kiosk layout that fits exactly one screen. */
export function CustomDashboard({ fill = false }: { fill?: boolean }) {
  const stored = useStore((s) => s.config?.customDashboard);
  const saved = useMemo(() => normalizeDashboard(stored), [stored]);
  const draft = useStore((s) => s.dashboardDraft);
  const edit = useStore((s) => s.editDashboard);
  const save = useStore((s) => s.saveDashboard);
  const reduceEffects = useStore((s) => s.display.kioskReduceEffects);
  // large kiosk screens enlarge the content (rem), so the grid metrics grow along
  const ui = useKioskScale(useKioskLayout(useStore((s) => s.display.kiosk)), useStore((s) => s.display.kioskZoom));
  const [ROW, GAP, MIN_FIT_ROW, FIT_GAP] = [BASE_ROW * ui, BASE_GAP * ui, BASE_MIN_FIT_ROW * ui, BASE_FIT_GAP * ui];
  const o = useOverview();
  const energy = useEnergy();
  const wide = useMedia('(min-width: 640px)');
  const editing = draft !== null;
  const widgets = draft ?? saved;
  const [adding, setAdding] = useState(false);
  const [settingsOf, setSettingsOf] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [announcement, announce] = useState('');
  const gridRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const area = useElementSize(areaRef, { w: 0, h: 0 }, editing || widgets.length > 0);
  const drag = useRef<Drag | null>(null);

  const update = (next: Widget[]) => edit(next);
  const describe = (w: Widget) => `${widgetLabel(w)}: Spalte ${w.x + 1}, Zeile ${w.y + 1}, ${w.w} × ${w.h}`;

  const startDrag = (e: PointerEvent<HTMLButtonElement>, w: Widget, kind: Drag['kind']) => {
    const grid = gridRef.current;
    if (e.button !== 0 || !grid) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const cell = (grid.clientWidth - GAP * (GRID_COLS - 1)) / GRID_COLS;
    drag.current = { id: w.id, kind, x: e.clientX, y: e.clientY, rect: { x: w.x, y: w.y, w: w.w, h: w.h }, list: widgets, pitchX: cell + GAP, pitchY: ROW + GAP, last: '' };
    setActive(w.id);
  };
  const moveDrag = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = Math.round((e.clientX - d.x) / d.pitchX);
    const dy = Math.round((e.clientY - d.y) / d.pitchY);
    const r = d.rect;
    const next = d.kind === 'move' ? { ...r, x: r.x + dx, y: r.y + dy } : { ...r, w: Math.min(r.w + dx, GRID_COLS - r.x), h: r.h + dy };
    const key = `${next.x},${next.y},${next.w},${next.h}`;
    if (key === d.last) return;
    d.last = key;
    update(placeWidget(d.list, d.id, next));
  };
  const endDrag = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setActive(null);
    const w = useStore.getState().dashboardDraft?.find((x) => x.id === d.id);
    if (w) announce(describe(w));
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, w: Widget) => {
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!step) return;
    e.preventDefault();
    e.stopPropagation();
    const [dx, dy] = step;
    const next = placeWidget(widgets, w.id, e.shiftKey ? { ...w, w: Math.min(w.w + dx, GRID_COLS - w.x), h: w.h + dy } : { ...w, x: w.x + dx, y: w.y + dy });
    update(next);
    const moved = next.find((x) => x.id === w.id);
    if (moved) announce(describe(moved));
  };

  const add = (type: WidgetType, options?: WidgetOptions, size?: [number, number]) => {
    const next = addWidget(widgets, type, options, size);
    update(next);
    setAdding(false);
    // widgets that need a choice open their settings right away (unless a part was already chosen)
    if (!options && (type === 'devices' || type === 'camera' || type === 'room' || type === 'text' || type === 'extension' || WIDGET_PARTS[type])) setSettingsOf(next[next.length - 1].id);
  };
  const finish = async () => {
    setSaving(true);
    const ok = await save({ widgets });
    setSaving(false);
    if (ok) edit(null);
  };
  const configured = settingsOf ? widgets.find((w) => w.id === settingsOf) : undefined;

  if (!editing && !widgets.length) {
    return (
      <Empty icon={<LayoutDashboard size={28} />} title="Deine eigene Startseite" text="Stelle dir die Übersicht aus Widgets zusammen – Uhr, Wetter, Messinstrumente, Energie, Kameras, Räume, Szenen, Geräte und Notizen – und ordne sie frei im Raster an.">
        <div className="flex flex-wrap justify-center gap-2">
          <button className="btn primary" onClick={() => edit([])}><Plus size={15} /> Leer beginnen</button>
          <button className="btn" onClick={() => edit(templateWidgets())}><LayoutTemplate size={15} /> Mit Vorlage beginnen</button>
        </div>
      </Empty>
    );
  }

  const rows = editing ? Math.max(gridRows(widgets) + EDIT_SPARE_ROWS, 8) : Math.max(gridRows(widgets), 1);
  // kiosk: the rows share the screen height, unless they would get too small to be readable
  const fitScreen = fill && !editing && wide && (area.h - FIT_GAP * (rows - 1)) / rows >= MIN_FIT_ROW;
  const list = wide ? widgets : readingOrder(widgets);
  const cellStyle = (w: Widget) =>
    wide ? { gridColumn: `${w.x + 1} / span ${w.w}`, gridRow: `${w.y + 1} / span ${w.h}` } : { minHeight: w.h * ROW + (w.h - 1) * GAP };

  return (
    <div className={`${fill ? 'h-full min-h-0 flex flex-col' : ''} ${fitScreen ? `kiosk-dash ${reduceEffects ? 'kiosk-reduce-effects' : ''}` : ''}`}>
      {editing ? (
        <div className="glass cdash-toolbar sticky top-0 z-20 mb-4 p-3 flex flex-wrap items-center gap-2" data-no-swipe>
          <div className="flex-1 min-w-[12rem]">
            <div className="font-semibold text-sm">Startseite bearbeiten</div>
            <p className="text-[0.7rem] text-muted">
              {wide ? 'Am Griff verschieben, an der Ecke unten rechts die Größe ändern. ⚙ für Einstellungen.' : 'Position und Größe über ⚙ – oder auf einem größeren Bildschirm per Ziehen.'}
              {fill && wide && ' Im Kioskmodus teilen sich die Zeilen die Bildschirmhöhe.'}
            </p>
          </div>
          <button className="btn" onClick={() => setAdding(true)}><Plus size={15} /> Widget</button>
          {!widgets.length && <button className="btn" onClick={() => update(templateWidgets())}><LayoutTemplate size={15} /> Vorlage</button>}
          <button className="btn" onClick={() => edit(null)}><X size={15} /> Abbrechen</button>
          <button className="btn primary" onClick={finish} disabled={saving}><Save size={15} /> Speichern</button>
        </div>
      ) : (
        !fill && (
          <div className="flex justify-end mb-3">
            <button className="btn !py-1.5 !text-xs" onClick={() => edit(saved)}><Pencil size={13} /> Bearbeiten</button>
          </div>
        )
      )}

      <div ref={areaRef} className={fill ? `flex-1 min-h-0 ${fitScreen ? '' : 'overflow-y-auto no-scrollbar'}` : ''}>
        <div
          ref={gridRef}
          className={`cdash-grid ${editing ? 'is-editing' : ''} ${fitScreen ? 'h-full' : ''}`}
          data-no-swipe={editing || undefined}
          style={
            wide
              ? { gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, ${fitScreen ? 'minmax(0, 1fr)' : `${ROW}px`})`, gap: fitScreen ? FIT_GAP : GAP }
              : { gridTemplateColumns: 'minmax(0, 1fr)', gap: GAP }
          }
        >
          {editing && wide && Array.from({ length: GRID_COLS }, (_, i) => (
            <i key={`col-${i}`} className="cdash-col" style={{ gridColumn: i + 1, gridRow: `1 / span ${rows}`, ['--pitch' as string]: `${ROW + GAP}px`, ['--row' as string]: `${ROW}px` }} aria-hidden />
          ))}
          {list.map((w) => (
            <div key={w.id} className={`cdash-cell ${w.type === 'gauge' ? 'cdash-gauge' : ''}`} style={cellStyle(w)}>
              {/* larger widgets enlarge their content (not on phones, where the cells grow with their content) */}
              <HudScale.Provider value={wide && scalesContent(w)}>
                <WidgetView w={w} o={o} energy={energy} />
              </HudScale.Provider>
              {editing && (
                <EditFrame
                  w={w}
                  active={active === w.id}
                  canDrag={wide}
                  onPointerDown={(e, kind) => startDrag(e, w, kind)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onKey={(e) => onKey(e, w)}
                  onSettings={() => setSettingsOf(w.id)}
                  onDelete={() => update(widgets.filter((x) => x.id !== w.id))}
                />
              )}
            </div>
          ))}
        </div>
        {editing && !widgets.length && (
          <p className="text-sm text-muted text-center mt-4">Noch leer – füge über „Widget“ das erste Widget hinzu oder beginne mit der Vorlage.</p>
        )}
      </div>

      <span role="status" aria-live="polite" className="sr-only">{announcement}</span>
      <AddDialog open={adding} onClose={() => setAdding(false)} onAdd={add} full={widgets.length >= MAX_WIDGETS} />
      {configured && (
        <WidgetSettings
          w={configured}
          o={o}
          onChange={(options) => update(widgets.map((x) => (x.id === configured.id ? { ...x, options } : x)))}
          onPlace={(r) => update(placeWidget(widgets, configured.id, r))}
          onClose={() => setSettingsOf(null)}
        />
      )}
    </div>
  );
}
