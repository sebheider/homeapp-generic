/**
 * Settings tab "Anzeige": display settings of THIS device (overview design, animation details, menu,
 * kiosk mode, night dimming, screensaver). They take effect immediately and are stored in the browser, not in the server
 * configuration, so the "Speichern" button is not needed here.
 */
import { useEffect, useState } from 'react';
import { Maximize, Minimize, MonitorSmartphone, Pencil } from 'lucide-react';
import { useStore } from '../../lib/store';
import { api } from '../../lib/api';
import type { KioskAgent } from '../../lib/types';
import { normalizeDashboard } from '../../lib/widgets';
import { KIOSK_ZOOMS, kioskScale, kioskState, menuMode, menuModeSettings, screenHint, useScreenInfo, type DashboardDesign, type DisplaySettings, type EffectsLevel, type MenuMode } from '../../lib/display';
import { Card, Field, NumInput, Switch, dimUnless } from './shared';

const DIM_LEVELS = [
  { value: 0.3, label: 'Leicht' },
  { value: 0.55, label: 'Mittel' },
  { value: 0.75, label: 'Stark' },
];

/** Selectable designs of the overview page. */
const DESIGNS: { id: DashboardDesign; name: string; text: string }[] = [
  {
    id: 'standard',
    name: 'Standard',
    text: 'Kommandozentrale mit Home Core, Rundinstrumenten, Energiefluss, Kameras und Raumkacheln. Folgt dem hellen bzw. dunklen Farbschema.',
  },
  {
    id: 'nexus',
    name: 'Nexus',
    text: 'Holografischer digitaler Zwilling des Hauses mit Etagen und Messwerten direkt an den Räumen, Hinweisen, Energie-Wellenform und Cockpit-Panels. Immer dunkel.',
  },
  {
    id: 'custom',
    name: 'Eigene',
    text: 'Frei gestaltbar: Widgets wie Uhr, Wetter, Messinstrumente, Energie, Kameras, Räume, Szenen, Geräte und Notizen beliebig im Raster anordnen. Folgt dem Farbschema.',
  },
];

/** Levels of the animation details, from all effects to the most economical one. */
const EFFECTS: { id: EffectsLevel; name: string; text: string }[] = [
  { id: 'high', name: 'Hoch', text: 'Alle Effekte: Glas-Unschärfe, bewegter Hintergrund, Lauflichter, Radar, drehende Ringe und Wellen.' },
  { id: 'medium', name: 'Mittel', text: 'Ruhender Hintergrund, leichtere Unschärfe, keine dauerhaften Zier-Animationen. Statusanzeigen bewegen sich weiter.' },
  { id: 'low', name: 'Niedrig', text: 'Keine Unschärfe und keine Dauer- oder Einblend-Animationen; nur Ladeanzeigen und Alarme bewegen sich. Für schwache Tablets.' },
];

/** Sizes of the menu; the hide button of the docked menu steps through them in this order. */
const MENU_MODES: { id: MenuMode; name: string; text: string }[] = [
  { id: 'full', name: 'Voll', text: 'Quer: Seitenleiste mit Namen, Uhr und Status. Hochkant und am Handy: Leiste unten mit Namen.' },
  { id: 'small', name: 'Klein', text: 'Nur Symbole – schmale Seitenleiste bzw. flache Leiste unten, mehr Platz für die Inhalte.' },
  { id: 'hidden', name: 'Ausblenden', text: 'Kein festes Menü; ☰ (oben links, am Handy unten rechts) öffnet alle Seiten.' },
];

/** Tiny drawing of a design for the selection cards. */
function DesignPreview({ id }: { id: DashboardDesign }) {
  if (id === 'custom') {
    // freely placed widgets of different sizes on a dashed grid
    const cells: [number, number, number, number, string][] = [[0, 0, 5, 2, '#22d3ee'], [5, 0, 3, 2, '#a78bfa'], [8, 0, 4, 1, '#facc15'], [8, 1, 4, 3, '#34d399'], [0, 2, 3, 2, '#fb7185'], [3, 2, 5, 2, '#22d3ee']];
    return (
      <svg viewBox="0 0 160 70" className="w-full h-20 rounded-xl" style={{ background: 'linear-gradient(135deg, #1b1f45, #2a1b45)' }} aria-hidden>
        {Array.from({ length: 12 }, (_, i) => <rect key={i} x={6 + i * 12.5} y="4" width="10.5" height="62" rx="2" fill="rgba(255,255,255,.04)" />)}
        {cells.map(([x, y, w, h, c], i) => (
          <rect key={`c${i}`} x={6 + x * 12.5} y={4 + y * 16} width={w * 12.5 - 2} height={h * 16 - 2} rx="4" fill="rgba(255,255,255,.07)" stroke={c} strokeOpacity=".7" />
        ))}
      </svg>
    );
  }
  if (id === 'standard') {
    return (
      <svg viewBox="0 0 160 70" className="w-full h-20 rounded-xl" style={{ background: 'linear-gradient(135deg, #1b1f45, #0f2a3a)' }} aria-hidden>
        <rect x="6" y="6" width="148" height="22" rx="5" fill="rgba(255,255,255,.07)" stroke="rgba(34,211,238,.4)" />
        <circle cx="80" cy="17" r="8" fill="none" stroke="#22d3ee" strokeWidth="1.5" />
        <rect x="12" y="12" width="26" height="8" rx="2" fill="rgba(255,255,255,.55)" />
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <rect x={6 + i * 37.5} y="33" width="33" height="31" rx="5" fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.12)" />
            <circle cx={22.5 + i * 37.5} cy="48.5" r="9" fill="none" stroke={['#facc15', '#34d399', '#22d3ee', '#fb7185'][i]} strokeWidth="2.5" strokeDasharray="40 60" />
          </g>
        ))}
      </svg>
    );
  }
  // isometric house with two floating storeys
  const iso = (x: number, y: number, z: number) => `${80 + (x - y) * 6.9},${30 + (x + y) * 4 - z * 8}`;
  const plate = (z: number, c: string) => <polygon points={[iso(0, 0, z), iso(6, 0, z), iso(6, 4, z), iso(0, 4, z)].join(' ')} fill={c} fillOpacity=".25" stroke={c} strokeWidth="1" />;
  return (
    <svg viewBox="0 0 160 70" className="w-full h-20 rounded-xl" style={{ background: 'radial-gradient(circle at 50% 40%, #1d2a6b, #050816 75%)' }} aria-hidden>
      <polygon points="45,66 115,66 135,4 25,4" fill="rgba(34,228,255,.08)" />
      <ellipse cx="80" cy="64" rx="34" ry="5" fill="none" stroke="#22e4ff" strokeOpacity=".8" />
      {plate(-2.2, '#3b82f6')}
      {plate(0, '#2dffa8')}
      {plate(2.2, '#ffb020')}
      <polyline points={`${iso(1, 1, 2.2)} 34,14 22,14`} fill="none" stroke="#ffb020" strokeWidth=".8" />
      <polyline points={`${iso(5, 2, 0)} 128,38 140,38`} fill="none" stroke="#2dffa8" strokeWidth=".8" />
    </svg>
  );
}

/** Opens the own start page in edit mode (an unsaved draft is kept). */
function EditDashboardButton() {
  const setView = useStore((s) => s.setView);
  const edit = useStore((s) => s.editDashboard);
  return (
    <button
      className="btn"
      onClick={() => {
        const s = useStore.getState();
        if (!s.dashboardDraft) edit(normalizeDashboard(s.config?.customDashboard));
        setView('home');
      }}
    >
      <Pencil size={15} /> Startseite bearbeiten
    </button>
  );
}

/** True while the page is shown in fullscreen. */
function useFullscreen() {
  const [on, setOn] = useState(Boolean(document.fullscreenElement));
  useEffect(() => {
    const update = () => setOn(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  return on;
}

/** What the browser reports about this screen, so a kiosk browser can be set up (zoom, orientation). */
function ScreenDiagnostics({ zoom, kiosk }: { zoom: number; kiosk: boolean }) {
  const i = useScreenInfo();
  const hint = screenHint(i);
  const scale = kiosk && i.kioskFits ? kioskScale(i.w, i.h, zoom) : 1;
  const rows: [string, string][] = [
    ['Fenster', `${i.w} × ${i.h} px`],
    ['Pixelverhältnis', String(i.dpr).replace('.', ',')],
    ['Physisch', `${Math.round(i.w * i.dpr)} × ${Math.round(i.h * i.dpr)} px`],
    ['Ausrichtung', i.portrait ? 'Hochformat' : 'Querformat'],
    ['Kiosk-Übersicht', !kiosk ? 'aus' : i.kioskFits ? 'aktiv' : 'zu klein'],
    ['Skalierung', `${Math.round(scale * 100)} %${zoom > 0 ? ' (manuell)' : ''}`],
  ];
  return (
    <div className="rounded-xl border border-line p-3 mt-3">
      <div className="text-xs font-semibold mb-2">Bildschirm-Diagnose</div>
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-muted">{k}</dt>
            <dd className="font-semibold tabular-nums truncate">{v}</dd>
          </div>
        ))}
      </dl>
      {hint && kiosk && <p className="text-[0.7rem] text-amber-300 mt-2">{hint}</p>}
    </div>
  );
}

/** Menu, kiosk and night settings of this device. */
/** Presence radar / light sensor of a kiosk agent at this display (see Einstellungen → Kiosk-Sensoren). */
function PresenceCard({ d, set }: { d: DisplaySettings; set: (p: Partial<DisplaySettings>) => void }) {
  const [agents, setAgents] = useState<KioskAgent[]>([]);
  useEffect(() => { api.kioskAgents().then((r) => setAgents(r.agents)).catch(() => undefined); }, []);
  const presence = useStore((s) => (d.presenceAgent ? s.states[kioskState(d.presenceAgent, 'presence')]?.val : undefined));
  const lux = useStore((s) => (d.presenceAgent ? s.states[kioskState(d.presenceAgent, 'lux')]?.val : undefined));
  const known = agents.some((a) => a.id === d.presenceAgent);
  return (
    <Card title="Präsenz- und Lichtsensor">
      <Field label="Sensor an diesem Display" hint="Kiosk-Agent am Raspberry Pi (Einstellungen → Kiosk-Sensoren).">
        <select className="field" value={d.presenceAgent} onChange={(e) => set({ presenceAgent: e.target.value })}>
          <option value="">– kein Sensor –</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.id}){a.online ? '' : ' – offline'}</option>)}
          {d.presenceAgent && !known && <option value={d.presenceAgent}>{d.presenceAgent}</option>}
        </select>
      </Field>
      {d.presenceAgent && (
        <p className="text-xs text-muted mt-2">
          Jetzt: {presence === true ? 'jemand da' : presence === false ? 'niemand da' : 'keine Präsenzdaten'}
          {typeof lux === 'number' ? ` · ${Math.round(lux)} lx` : ''}
        </p>
      )}
      <div className={`mt-2 ${dimUnless(Boolean(d.presenceAgent))}`}>
        <Switch label="Bildschirmschoner immer, wenn niemand da ist (nicht nur im Ruhezeitraum)" checked={d.presenceScreensaver} onChange={(v) => set({ presenceScreensaver: v })} />
        <Switch label="Abdunkeln, wenn es im Raum dunkel ist" checked={d.lightDim} onChange={(v) => set({ lightDim: v })} />
        <div className={`grid sm:grid-cols-3 gap-4 mt-1 ${dimUnless(d.lightDim)}`}>
          <Field label="Dunkel unter (Lux)"><NumInput value={d.lightDimLux} onChange={(v) => set({ lightDimLux: Math.max(0, v ?? 5) })} /></Field>
        </div>
      </div>
      <p className="text-[0.7rem] text-muted mt-2">
        Wer vor dem Display steht, weckt den Bildschirmschoner und hält ihn fern. Die Stärke des Abdunkelns entspricht der Einstellung „Nachts abdunkeln“.
        Das echte Abschalten und die Hintergrundbeleuchtung regelt der Agent selbst (Einstellungen → Kiosk-Sensoren).
      </p>
    </Card>
  );
}

export function DisplayTab() {
  const d = useStore((s) => s.display);
  const setDisplay = useStore((s) => s.setDisplay);
  const set = (p: Partial<DisplaySettings>) => setDisplay(p);
  const fullscreen = useFullscreen();
  const kioskUrl = `${location.origin}/?kiosk=1`;
  return (
    <>
      <p className="text-sm text-muted mb-4 flex items-start gap-2">
        <MonitorSmartphone size={16} className="mt-0.5 shrink-0" />
        Diese Einstellungen gelten nur für dieses Gerät bzw. diesen Browser und wirken sofort – „Speichern“ ist hier nicht nötig. So kann z. B. ein Wandtablet im Kioskmodus laufen, während das Handy normal bleibt.
      </p>

      <Card title="Design der Übersicht">
        <div className="grid sm:grid-cols-3 gap-3">
          {DESIGNS.map((o) => {
            const active = d.dashboardDesign === o.id;
            return (
              <button
                key={o.id}
                className={`text-left rounded-2xl p-3 border transition ${active ? 'border-violet-400/70 bg-violet-500/10 shadow-[0_0_26px_-10px_rgba(167,139,250,.9)]' : 'border-line hover:border-violet-400/40'}`}
                onClick={() => set({ dashboardDesign: o.id })}
                aria-pressed={active}
              >
                <DesignPreview id={o.id} />
                <div className="flex items-center gap-2 mt-3">
                  <span className="font-semibold">{o.name}</span>
                  {active && <span className="chip on">aktiv</span>}
                </div>
                <p className="text-xs text-muted mt-1">{o.text}</p>
              </button>
            );
          })}
        </div>
        {d.dashboardDesign === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <EditDashboardButton />
            <p className="text-xs text-muted flex-1 min-w-[14rem]">Die eigene Startseite wird auf dem Server gespeichert und gilt für alle Geräte mit diesem Design. Auf dem Handy stehen die Widgets untereinander.</p>
          </div>
        )}
        <p className="text-[0.7rem] text-muted mt-3">
          Die Räume ordnet Nexus nach ihrer Etage an (<i>Einstellungen → Räume</i>). Für Kiosk-Browser lässt sich das Design auch über die Adresse wählen: <code className="select-all">{`${location.origin}/?design=nexus`}</code> bzw. <code className="select-all">?design=custom</code>
        </p>
      </Card>

      <Card title="Animationsdetails">
        <div className="grid sm:grid-cols-3 gap-3" role="radiogroup" aria-label="Animationsdetails">
          {EFFECTS.map((o) => {
            const active = d.effects === o.id;
            return (
              <button
                key={o.id}
                className={`flex flex-col text-left rounded-2xl p-3 border transition ${active ? 'border-violet-400/70 bg-violet-500/10' : 'border-line hover:border-violet-400/40'}`}
                onClick={() => set({ effects: o.id })}
                role="radio"
                aria-checked={active}
              >
                <div className="flex items-center gap-2 min-h-9">
                  <span className="font-semibold">{o.name}</span>
                  {active && <span className="chip on">aktiv</span>}
                </div>
                <p className="text-xs text-muted mt-1">{o.text}</p>
              </button>
            );
          })}
        </div>
        <p className="text-[0.7rem] text-muted mt-3">Weniger Details entlasten die Grafik von Wandtablets und älteren Geräten. Ist im Betriebssystem „Bewegung reduzieren“ eingeschaltet, entfallen Animationen unabhängig von dieser Stufe.</p>
      </Card>

      <Card title="Menü">
        <div className="grid sm:grid-cols-3 gap-3 mb-3" role="radiogroup" aria-label="Menügröße">
          {MENU_MODES.map((o) => {
            const active = menuMode(d) === o.id;
            return (
              <button
                key={o.id}
                className={`flex flex-col text-left rounded-2xl p-3 border transition ${active ? 'border-violet-400/70 bg-violet-500/10' : 'border-line hover:border-violet-400/40'}`}
                onClick={() => set(menuModeSettings(o.id))}
                role="radio"
                aria-checked={active}
              >
                <div className="flex items-center gap-2 min-h-9">
                  <span className="font-semibold">{o.name}</span>
                  {active && <span className="chip on">aktiv</span>}
                </div>
                <p className="text-xs text-muted mt-1">{o.text}</p>
              </button>
            );
          })}
        </div>
        <p className="text-[0.7rem] text-muted mb-3">Im Querformat schaltet der Knopf unten in der Seitenleiste ebenfalls weiter: Voll → Klein → Ausblenden. Hochkant (z. B. Wandtablet 1200 × 1920) sitzt das Menü als Leiste unten in Daumenhöhe; ☰ öffnet die Übersicht aller Seiten, in der sich die Leiste auch umschalten lässt. Am Handy zeigt die Leiste vier Seiten, „Mehr“ öffnet die übrigen.</p>
        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3">
          <div>
            <Switch label="Automatisch ausblenden" checked={d.menuAutoHide} onChange={(v) => set({ menuAutoHide: v })} />
            <div className={dimUnless(d.menuAutoHide)}>
              <Field label="nach Sekunden ohne Bedienung">
                <NumInput value={d.menuAutoHideSeconds} onChange={(v) => set({ menuAutoHideSeconds: Math.max(5, v ?? 20) })} />
              </Field>
            </div>
          </div>
        </div>
      </Card>

      <Card title="Kioskmodus (Daueranzeige)" right={<span className={`chip ${d.kiosk ? 'on' : ''}`}>{d.kiosk ? 'aktiv' : 'aus'}</span>}>
        <Switch label="Kioskmodus" checked={d.kiosk} onChange={(v) => set(v ? { kiosk: true, menuAutoHide: true } : { kiosk: false })} />
        <p className="text-xs text-muted mb-3">
          Die Übersicht passt ohne Scrollen auf einen Bildschirm (optimiert für 1280 × 800 quer bzw. 800 × 1280 hochkant, z. B. ein Wandtablet; auf größeren Displays wie 10" mit 1920 × 1200 oder 1200 × 1920 werden Schrift und Bedienelemente automatisch vergrößert). Das Menü blendet sich aus, bleibt aber über ☰ (alle Seiten als große Kacheln) immer erreichbar – alle Funktionen sind weiter nutzbar. Für Kiosk-Browser (z. B. Fully Kiosk) als Startadresse: <code className="select-all">{kioskUrl}</code>
        </p>
        <div className={`grid sm:grid-cols-2 gap-x-8 gap-y-3 ${dimUnless(d.kiosk)}`}>
          <Field label="Zur Übersicht zurück nach Sekunden ohne Bedienung" hint="0 = nie. Die Einstellungen werden dabei nicht verlassen.">
            <NumInput value={d.kioskHomeSeconds} onChange={(v) => set({ kioskHomeSeconds: Math.max(0, v ?? 0) })} />
          </Field>
          <div>
            <Switch label="Mauszeiger ausblenden (nach 5 s)" checked={d.kioskHideCursor} onChange={(v) => set({ kioskHideCursor: v })} />
            <Switch label="Bild leicht verschieben (gegen Einbrennen)" checked={d.kioskShift} onChange={(v) => set({ kioskShift: v })} />
            <div>
              <Switch label="Bildschirm eingeschaltet lassen" checked={d.kioskWakeLock} onChange={(v) => set({ kioskWakeLock: v })} />
              <p className="text-[0.7rem] text-muted">Funktioniert im Browser nur über HTTPS; Kiosk-Browser haben dafür eine eigene Einstellung.</p>
            </div>
            <div>
              <Switch label="Effekte reduzieren, um Grafikleistung zu sparen" checked={d.kioskReduceEffects} onChange={(v) => set({ kioskReduceEffects: v })} />
              <p className="text-[0.7rem] text-muted">Deaktiviert den Hintergrund-Blur auf der Kiosk-Übersicht.</p>
            </div>
          </div>
        </div>
        <div className={`mt-4 ${dimUnless(d.kiosk)}`}>
          <Field label="Skalierung" hint="Automatisch: passend zur Fenstergröße (Basis 1280 × 800 bzw. 800 × 1280). Bei Bedarf fest einstellen, z. B. 150 % für 1200 × 1920.">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Skalierung">
              {KIOSK_ZOOMS.map((z) => (
                <button key={z} role="radio" aria-checked={d.kioskZoom === z} className={`chip ${d.kioskZoom === z ? 'on' : ''}`} onClick={() => set({ kioskZoom: z })}>
                  {z === 0 ? 'Automatisch' : `${Math.round(z * 100)} %`}
                </button>
              ))}
            </div>
          </Field>
        </div>
        <ScreenDiagnostics zoom={d.kioskZoom} kiosk={d.kiosk} />
        {document.fullscreenEnabled && (
          <button className="btn mt-4" onClick={() => (fullscreen ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => undefined)}>
            {fullscreen ? <Minimize size={15} /> : <Maximize size={15} />} {fullscreen ? 'Vollbild beenden' : 'Vollbild'}
          </button>
        )}
      </Card>

      <Card title="Nachts abdunkeln">
        <Switch label="Bildschirm nachts abdunkeln" checked={d.nightDim} onChange={(v) => set({ nightDim: v })} />
        <div className={`grid sm:grid-cols-3 gap-4 mt-2 ${dimUnless(d.nightDim)}`}>
          <Field label="Von">
            <input className="field" type="time" value={d.nightFrom} onChange={(e) => set({ nightFrom: e.target.value })} />
          </Field>
          <Field label="Bis">
            <input className="field" type="time" value={d.nightTo} onChange={(e) => set({ nightTo: e.target.value })} />
          </Field>
          <Field label="Stärke">
            <select className="field" value={d.nightLevel} onChange={(e) => set({ nightLevel: Number(e.target.value) })}>
              {DIM_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </Field>
        </div>
        <p className="text-[0.7rem] text-muted mt-2">Die App bleibt dabei bedienbar; Alarme sind weiterhin sichtbar.</p>
      </Card>

      <PresenceCard d={d} set={set} />

      <Card title="Bildschirmschoner" right={<span className={`chip ${d.screensaver ? 'on' : ''}`}>{d.screensaver ? 'aktiv' : 'aus'}</span>}>
        <Switch label="Bildschirmschoner im Ruhezeitraum" checked={d.screensaver} onChange={(v) => set({ screensaver: v })} />
        <div className={`grid sm:grid-cols-3 gap-4 mt-2 ${dimUnless(d.screensaver)}`}>
          <Field label="Von">
            <input className="field" type="time" value={d.screensaverFrom} onChange={(e) => set({ screensaverFrom: e.target.value })} />
          </Field>
          <Field label="Bis">
            <input className="field" type="time" value={d.screensaverTo} onChange={(e) => set({ screensaverTo: e.target.value })} />
          </Field>
          <div className="self-end">
            <Switch label="Uhr anzeigen" checked={d.screensaverClock} onChange={(v) => set({ screensaverClock: v })} />
          </div>
        </div>
        <p className="text-[0.7rem] text-muted mt-2">
          Nach einer Minute ohne Bedienung zeigt das Gerät im Zeitraum nur noch einen schwarzen Bildschirm (optional mit kleiner, wandernder Uhr) – die App wird dabei vollständig angehalten und spart so Prozessor- und Grafikleistung. Antippen weckt sie für eine Minute nach der letzten Berührung auf; das Antippen selbst löst nichts in der App aus. Alarme und Kamera-Popups wecken den Bildschirm automatisch; in den Einstellungen und bei geöffneter Kamera startet er nicht.
        </p>
      </Card>
    </>
  );
}
