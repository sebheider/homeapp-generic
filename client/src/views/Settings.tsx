/**
 * Settings page (loaded on demand). Edits a local draft of the configuration and saves it in one go;
 * the individual tabs live in ./settings/.
 */
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { Bell, BellRing, Camera, ChevronDown, CloudOff, CloudSun, Fan, Info, LayoutGrid, LayoutList, MonitorSmartphone, Music, Network, Plug, Printer3d, Radar, RotateCw, Save, Search, Sparkles, Trash2, Zap, type LucideIcon } from 'lucide-react';
import { api, type EnvDefault } from '../lib/api';
import { useStore } from '../lib/store';
import type { AppConfig } from '../lib/types';
import { Empty, Loading, Modal, PageHeader } from '../components/ui';
import type { TabProps } from './settings/shared';
import { ConnectionTab } from './settings/ConnectionTab';
import { DevicesTab } from './settings/DevicesTab';
import { RoomsTab } from './settings/RoomsTab';
import { ScenesTab } from './settings/ScenesTab';
import { CamerasTab } from './settings/CamerasTab';
import { EnergyTab } from './settings/EnergyTab';
import { WeatherTab } from './settings/WeatherTab';
import { GeneralTab } from './settings/GeneralTab';
import { LayoutTab } from './settings/LayoutTab';
import { AlertsTab } from './settings/AlertsTab';
import { DisplayTab } from './settings/DisplayTab';
import { PrinterTab } from './settings/PrinterTab';
import { SpotifyTab } from './settings/SpotifyTab';
import { KioskTab } from './settings/KioskTab';
import { WasteTab } from './settings/WasteTab';
import { VentilationTab } from './settings/VentilationTab';
import { PushoverTab } from './settings/PushoverTab';
import { ModulesTab } from './settings/ModulesTab';

type Tab = 'modules' | 'connection' | 'devices' | 'rooms' | 'layout' | 'scenes' | 'cameras' | 'printer' | 'spotify' | 'energy' | 'weather' | 'alerts' | 'display' | 'general' | 'kiosk' | 'waste' | 'ventilation' | 'pushover';

/** Tabs in display order with their components. */
const TABS: { id: Tab; label: string; group: string; description: string; icon: LucideIcon; Component: ComponentType<TabProps> }[] = [
  { id: 'display', label: 'Anzeige & Bedienung', group: 'Im Alltag', description: 'Design, Animationsdetails, Menü, Kioskmodus, Nachtabdunkelung und Bildschirmschoner für dieses Gerät.', icon: MonitorSmartphone, Component: DisplayTab },
  { id: 'layout', label: 'Seiten & Reihenfolge', group: 'Im Alltag', description: 'Licht und Klima gruppieren, Geräte sortieren und ein- oder ausblenden.', icon: LayoutList, Component: LayoutTab },
  { id: 'alerts', label: 'Benachrichtigungen', group: 'Im Alltag', description: 'Alarme und Hinweise festlegen.', icon: Bell, Component: AlertsTab },
  { id: 'pushover', label: 'Pushover (Handy)', group: 'Im Alltag', description: 'Push-Nachrichten aufs Handy: Alarme, Warnungen, Sensoren, Müll, Lüftung, 3D-Drucker und Kameras – je Ereignis mit Priorität und Ruhezeit.', icon: BellRing, Component: PushoverTab },
  { id: 'rooms', label: 'Räume', group: 'Mein Zuhause', description: 'Räume benennen, Etagen zuordnen und die Reihenfolge ändern.', icon: LayoutGrid, Component: RoomsTab },
  { id: 'devices', label: 'Geräte', group: 'Mein Zuhause', description: 'Geräte finden, Datenpunkte zuordnen und Räume auswählen.', icon: Plug, Component: DevicesTab },
  { id: 'scenes', label: 'Szenen', group: 'Mein Zuhause', description: 'Mehrere Aktionen mit einem Tipp ausführen.', icon: Sparkles, Component: ScenesTab },
  { id: 'cameras', label: 'Kameras & Einblendungen', group: 'Funktionen', description: 'Kameras, Bewegungserkennung, Vorschaubilder und Popup-Zeitpläne einstellen.', icon: Camera, Component: CamerasTab },
  { id: 'printer', label: '3D-Drucker', group: 'Funktionen', description: 'OctoPrint oder Bambu Lab verbinden, Webcam einrichten und die Anzeige während des Drucks festlegen.', icon: Printer3d, Component: PrinterTab },
  { id: 'spotify', label: 'Spotify', group: 'Funktionen', description: 'Spotify-Konto verbinden, Verstärker wählen und den Mini-Player der Übersicht einstellen.', icon: Music, Component: SpotifyTab },
  { id: 'weather', label: 'Wetter', group: 'Funktionen', description: 'Standort, Wetterstation, Vorhersage und Regenradar einstellen.', icon: CloudSun, Component: WeatherTab },
  { id: 'waste', label: 'Müllabfuhr', group: 'Funktionen', description: 'Abfuhrkalender (ICS/webcal) abonnieren und an die Tonnen erinnern.', icon: Trash2, Component: WasteTab },
  { id: 'ventilation', label: 'Lüftung', group: 'Funktionen', description: 'Lüftungsempfehlung aus Luftfeuchte, CO₂ und Außenluft; Schwellen und Räume.', icon: Fan, Component: VentilationTab },
  { id: 'kiosk', label: 'Kiosk-Sensoren', group: 'Funktionen', description: 'Präsenzradar LD2410, Lichtsensor und CO₂-Sensor am Raspberry Pi: Display aus bei Abwesenheit, Helligkeit nach Umgebungslicht.', icon: Radar, Component: KioskTab },
  { id: 'energy', label: 'Energie', group: 'Funktionen', description: 'Solar, Batterie, Stromnetz und Verbrauch zuordnen.', icon: Zap, Component: EnergyTab },
  { id: 'general', label: 'Allgemein & App', group: 'System', description: 'App-Name, Version, Neuigkeiten und Installation.', icon: Info, Component: GeneralTab },
  { id: 'modules', label: 'Module', group: 'System', description: 'Optionale Funktionen aktivieren und deaktivieren.', icon: Plug, Component: ModulesTab },
  { id: 'connection', label: 'Verbindungen & Zugriff', group: 'System', description: 'Datenquelle und Surveillance Station einrichten.', icon: Network, Component: ConnectionTab },
];
const GROUPS = [...new Set(TABS.map((t) => t.group))];

/** Area to open from the address (`?tab=spotify`, used when Spotify's login returns). */
function tabFromAddress(): Tab {
  const tab = new URLSearchParams(location.search).get('tab');
  return TABS.some((t) => t.id === tab) ? (tab as Tab) : 'display';
}

/** Announces the result of a Spotify login (`spotify=connected|error`, `message`) once and cleans the address. */
function useLoginResult() {
  const toast = useStore((s) => s.toast);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const result = params.get('spotify');
    if (result === 'connected') toast('Spotify verbunden', 'success');
    else if (result === 'error') toast(`Spotify: ${params.get('message') || 'Verbindung fehlgeschlagen'}`, 'error');
    if (params.has('tab') || result) history.replaceState(null, '', `${location.pathname}${location.hash}`);
  }, []);
}

type TabInfo = (typeof TABS)[number];

/** Areas whose label, group or description contain the search text. */
const searchTabs = (query: string) => {
  const q = query.trim().toLocaleLowerCase('de');
  return TABS.filter((t) => `${t.label} ${t.group} ${t.description}`.toLocaleLowerCase('de').includes(q));
};

/** Search field over the settings areas. */
function TabSearch({ query, setQuery, autoFocus = false }: { query: string; setQuery: (q: string) => void; autoFocus?: boolean }) {
  return (
    <div className="relative">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
      <input className="field !pl-9" type="search" placeholder="Bereich finden …" aria-label="Einstellungsbereiche durchsuchen" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus={autoFocus} />
    </div>
  );
}

/**
 * Touch-friendly choice of the settings area (phones, tablets, kiosk in portrait format): a large button with
 * the current area opens a sheet with all areas as tiles, grouped and searchable.
 */
function TabPicker({ active, onPick }: { active: TabInfo; onPick: (tab: Tab) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const matches = searchTabs(query);
  const ActiveIcon = active.icon;
  const pick = (tab: Tab) => {
    onPick(tab);
    setOpen(false);
    setQuery('');
  };
  return (
    <div className="settings-select lg:hidden min-w-0">
      <button className="settings-picker glass w-full" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`Einstellungsbereich: ${active.label} – Bereich wechseln`}>
        <span className="icon-bubble on tone-violet"><ActiveIcon size={20} /></span>
        <span className="flex-1 min-w-0 text-left">
          <span className="block text-xs text-muted">{active.group}</span>
          <span className="block font-semibold truncate">{active.label}</span>
        </span>
        <span className="hidden sm:inline text-sm text-muted">Bereich wechseln</span>
        <ChevronDown size={18} className="text-muted shrink-0" />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Einstellungsbereich" wide>
        <div className="grid gap-5">
          <TabSearch query={query} setQuery={setQuery} />
          {GROUPS.map((group) => {
            const entries = matches.filter((t) => t.group === group);
            return entries.length > 0 && (
              <section key={group}>
                <h3 className="section-title mb-2">{group}</h3>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {entries.map((t) => {
                    const Icon = t.icon;
                    const current = t.id === active.id;
                    return (
                      <button key={t.id} className={`settings-tile ${current ? 'on' : ''}`} onClick={() => pick(t.id)} aria-current={current ? 'page' : undefined}>
                        <span className={`icon-bubble tone-violet ${current ? 'on' : ''}`}><Icon size={20} /></span>
                        <span className="min-w-0">
                          <span className="block font-semibold">{t.label}</span>
                          <span className="block text-xs text-muted line-clamp-2">{t.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {matches.length === 0 && <p className="text-sm text-muted" role="status">Kein passender Bereich gefunden.</p>}
        </div>
      </Modal>
    </div>
  );
}

/** Settings: edits a local draft of the configuration and saves it in one go. */
export function SettingsView() {
  const [draft, setDraft] = useState<AppConfig | null>(null);
  // JSON of the last saved config, used to detect unsaved changes
  const [saved, setSaved] = useState<string>('');
  const [webhookToken, setToken] = useState('');
  const [kioskToken, setKioskToken] = useState('');
  const [envDefaults, setEnvDefaults] = useState<EnvDefault[]>([]);
  const [resetEnv, setResetEnv] = useState<string[]>([]);
  const toast = useStore((s) => s.toast);
  const [tab, setTab] = useState<Tab>(tabFromAddress);
  useLoginResult();
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const savingRef = useRef(false);
  // serialising the whole draft is not free, so only redo it when the draft changes
  const changed = useMemo(() => draft !== null && JSON.stringify(draft) !== saved, [draft, saved]);
  const dirty = changed || (draft !== null && resetEnv.length > 0);

  const load = () =>
    api.getConfig().then(({ config, webhookToken, kioskToken, envDefaults }) => {
      setDraft(config);
      setSaved(JSON.stringify(config));
      setToken(webhookToken);
      setKioskToken(kioskToken ?? '');
      setEnvDefaults(envDefaults);
      setResetEnv([]);
    });
  const initialLoad = () => {
    setLoadError('');
    load().catch((e: Error) => setLoadError(e.message || 'Die Konfiguration konnte nicht geladen werden.'));
  };
  useEffect(initialLoad, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (!draft) {
    if (!loadError) return <Loading />;
    return (
      <div>
        <PageHeader title="Einstellungen" />
        <Empty icon={<CloudOff size={28} />} title="Einstellungen nicht verfügbar" text={loadError}>
          <button className="btn primary" onClick={initialLoad}><RotateCw size={15} /> Erneut versuchen</button>
        </Empty>
      </div>
    );
  }

  const save = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await api.saveConfig(draft, resetEnv);
      toast('Einstellungen gespeichert', 'success');
      // reload so that secrets / env-derived values reflect what the server stored
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  /** Marks a field to go back to its environment default (and shows that value right away), or undoes that. */
  const toggleReset = (field: string) => {
    if (resetEnv.includes(field)) {
      setResetEnv(resetEnv.filter((f) => f !== field));
      return;
    }
    setResetEnv([...resetEnv, field]);
    const d = envDefaults.find((x) => x.field === field);
    if (d && d.value !== undefined) {
      const [section, key] = field.split('.') as ['iobroker' | 'surveillance', string];
      setDraft({ ...draft, [section]: { ...draft[section], [key]: d.value } });
    }
  };

  const props: TabProps = { draft, setDraft, webhookToken, kioskToken, envDefaults, resetEnv, toggleReset };
  const active = TABS.find((t) => t.id === tab)!;
  const Active = active.Component;
  const matches = searchTabs(query);
  // a new area starts at the top of the page, where the picker shows which one is open
  const pickTab = (next: Tab) => {
    setTab(next);
    document.querySelector('main')?.scrollTo({ top: 0 });
  };
  return (
    <div>
      <PageHeader title="Einstellungen" subtitle="Dein Zuhause und deine Bedienoberfläche">
        <button className="btn primary" disabled={!dirty || saving} onClick={save}><Save size={16} /> {saving ? 'Speichert …' : 'Speichern'}</button>
      </PageHeader>
      <div className="settings-grid grid lg:grid-cols-[15rem_minmax(0,1fr)] gap-5 items-start">
        <TabPicker active={active} onPick={pickTab} />
        <nav aria-label="Einstellungsbereiche" className="settings-nav glass p-3 hidden lg:block">
          <div className="mb-4"><TabSearch query={query} setQuery={setQuery} /></div>
          <div className="grid gap-4">
            {GROUPS.map((group) => {
              const entries = matches.filter((t) => t.group === group);
              return entries.length > 0 && (
                <div key={group}>
                  <h2 className="text-xs text-muted font-semibold uppercase tracking-wider px-2 mb-1">{group}</h2>
                  <div className="flex flex-col gap-1">
                    {entries.map((t) => {
                      const Icon = t.icon;
                      return <button key={t.id} aria-current={tab === t.id ? 'page' : undefined} aria-controls="settings-content" className={`chip !rounded-xl text-left !justify-start ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}><Icon size={15} /> {t.label}</button>;
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          {matches.length === 0 && <p className="text-sm text-muted p-2" role="status">Kein passender Bereich gefunden.</p>}
        </nav>
        <section id="settings-content" aria-labelledby="settings-heading" className="min-w-0 max-w-5xl">
          <div className="mb-4">
            <h2 id="settings-heading" className="text-xl font-semibold">{active.label}</h2>
            <p className="text-sm text-muted mt-1">{active.description}</p>
            <p className="text-xs text-muted mt-2">{tab === 'display' ? 'Nur dieses Gerät · Änderungen wirken sofort.' : 'Für alle Geräte · Änderungen mit „Speichern“ übernehmen.'}</p>
          </div>
          <fieldset disabled={saving} className="min-w-0">
            <Active {...props} />
          </fieldset>
        </section>
      </div>
      {dirty && (
        <div className="sticky bottom-3 z-20 glass !bg-[var(--bg2)] p-3 mt-4 flex flex-wrap items-center justify-between gap-3" role="status">
          <span className="text-sm">Ungespeicherte Änderungen für alle Geräte</span>
          <button className="btn primary" disabled={saving} onClick={save}><Save size={16} /> {saving ? 'Speichert …' : 'Änderungen speichern'}</button>
        </div>
      )}
    </div>
  );
}
