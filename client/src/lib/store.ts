/**
 * Global client state (zustand).
 *
 * Holds the configuration, all live datapoint values, connection status, camera list,
 * motion events, the 3D printer and UI state (current view, theme). The server pushes changes
 * through one WebSocket; `set()` updates optimistically and rolls back on error.
 */
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { api } from './api';
import { loadDisplay, saveDisplay, type DisplaySettings } from './display';
import { reloadIfUpdated } from './pwa';
import { CAMERA_POPUP_PAUSE_MINUTES, loadCameraPopupPause, saveCameraPopupPause, shouldShowCameraPopup } from './cameraPopups';
import { loadHiddenPrinterJob, saveHiddenPrinterJob, shouldShowPrinterPopup } from './printer';
import { applyCommand } from './spotify';
import { isExtensionView, type ExtensionManifest } from './extensions';
import type { CustomDashboard, Widget } from './widgets';
import type {
  ActiveAlert, AppConfig, CameraInfo, MotionEvent, PopupPosition, PopupSize, PrinterData, PrinterPopupEvent, RadarFrame, SpotifyCommand, SpotifyState, StateEntry, Status, VentilationData, WasteData,
} from './types';

/** Built-in pages of the app; the current one is mirrored in the URL hash (`#energy`). */
export const VIEWS = ['home', 'weather', 'rooms', 'lights', 'climate', 'energy', 'cameras', 'spotify', 'printer', 'mower', 'radar', 'settings'] as const;
/** A built-in page. */
export type BuiltinView = (typeof VIEWS)[number];
/** A page of the app: a built-in page or the page of an external module (`ext-<id>`). */
export type View = BuiltinView | `ext-${string}`;
/** Colour scheme; stored in localStorage. */
export type Theme = 'dark' | 'light';

/** Type guard for strings coming from the URL hash. */
export const isView = (v: string): v is View => (VIEWS as readonly string[]).includes(v) || isExtensionView(v);

/** The view named in the current URL hash, or null if the hash is empty / unknown. */
export const viewFromHash = (): View | null => {
  const h = location.hash.replace('#', '');
  return isView(h) ? h : null;
};

/** Short-lived notification shown at the bottom of the screen. */
export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'success';
}

/** Live radar frame and when this browser received it. */
export interface RadarSample {
  frame: RadarFrame;
  at: number;
}

interface Store {
  /** True once the bootstrap data has been loaded. */
  ready: boolean;
  loadError: string | null;
  wsConnected: boolean;
  config: AppConfig | null;
  /** Live values of all known datapoints, keyed by ioBroker state id. */
  states: Record<string, StateEntry>;
  status: Status | null;
  cameras: CameraInfo[];
  /** Motion events for the six-hour activity timeline, newest first. */
  motion: MotionEvent[];
  /** Event currently shown in the camera pop-up. */
  popup: MotionEvent | null;
  /** Pop-up look while the settings preview is shown (instead of the saved one). */
  popupOverride: { position: PopupPosition; size: PopupSize } | null;
  /** Browser-local deadline; incoming events are still added to the motion history. */
  cameraPopupsSuppressedUntil: number;
  /** Active notifications (server rules), most severe first. */
  alerts: ActiveAlert[];
  /** 3D printer state (null until loaded / with older servers). */
  printer: PrinterData | null;
  /** Webcam pop-up of the printer currently shown; `until` = when it closes by itself, `look` = position / size of a settings preview. */
  printerPopup: (PrinterPopupEvent & { until: number; look?: { position: PopupPosition; size: PopupSize } }) | null;
  /** Print whose regular pop-ups this browser hides (persisted). */
  printerPopupHiddenJob: string | null;
  /** Spotify playback state (null until loaded / with older servers). */
  spotify: SpotifyState | null;
  /** Upcoming waste pickups (null with older servers). */
  waste: WasteData | null;
  /** Ventilation advice per room (null with older servers). */
  ventilation: VentilationData | null;
  /** Manifests of the installed external modules (enabled or not, see `config.extensions`). */
  extensions: ExtensionManifest[];
  /** Latest live frame of each wall display's presence radar (only while a radar page is open, see `watchRadar`). */
  radar: Record<string, RadarSample>;
  /** Notifications the user hid: alert id -> `since` of the hidden occurrence (persisted). */
  dismissedAlerts: Record<string, number>;
  toasts: Toast[];
  view: View;
  theme: Theme;
  /** Room the rooms page is focused on (null = all rooms). */
  roomFilter: string | null;
  /** Camera shown in the fullscreen viewer. */
  focusCamera: string | null;
  /** Notification list / changelog dialog open. */
  notificationsOpen: boolean;
  changelogOpen: boolean;
  /** Display settings of this device (menu, kiosk mode, night dimming), see lib/display.ts. */
  display: DisplaySettings;
  /** The hidden menu is currently opened as an overlay (via its handle). */
  menuOpen: boolean;
  /** Unsaved layout while the freely designable start page is edited (null = not editing); survives page changes. */
  dashboardDraft: Widget[] | null;
  boot: () => Promise<void>;
  /** Reloads only the camera list (it can appear after the page was opened). */
  refreshCameras: () => Promise<void>;
  setView: (v: View, roomId?: string | null) => void;
  setTheme: (t: Theme) => void;
  set: (id: string | undefined, value: unknown) => void;
  runScene: (id: string, name: string) => Promise<void>;
  dismissPopup: () => void;
  suppressCameraPopups: (minutes: number) => void;
  resumeCameraPopups: () => void;
  /** Shows a sample pop-up with the given look (settings preview). */
  previewPopup: (position: PopupPosition, size: PopupSize) => void;
  /** Shows the webcam pop-up of the printer (from the server, or a `preview` with the look from the settings). */
  showPrinterPopup: (e: PrinterPopupEvent, look?: { position: PopupPosition; size: PopupSize }) => void;
  dismissPrinterPopup: () => void;
  /** Hides the regular printer pop-ups in this browser until the current print ends. */
  hidePrinterPopupsForJob: (jobId: string) => void;
  /** Controls Spotify: the effect is shown at once; if the command fails, the real state is loaded. */
  spotifyCommand: (cmd: SpotifyCommand) => Promise<boolean>;
  /** Hides a notification until it occurs again. */
  dismissAlert: (a: ActiveAlert) => void;
  /** Acknowledges one notification, or all waiting ones without an id (on the server, for every browser). */
  ackAlert: (id?: string) => Promise<void>;
  /** Jumps to the page (and room) a notification points to. */
  openTarget: (view: string | null, room?: string | null) => void;
  openCamera: (id: string | null) => void;
  showNotifications: (open: boolean) => void;
  showChangelog: (open: boolean) => void;
  /** Changes and stores display settings of this device. */
  setDisplay: (p: Partial<DisplaySettings>) => void;
  setMenuOpen: (open: boolean) => void;
  /** Starts editing the start page with the given layout, updates the draft or (null) stops editing. */
  editDashboard: (draft: Widget[] | null) => void;
  /** Saves the freely designable start page; true on success. */
  saveDashboard: (dashboard: CustomDashboard) => Promise<boolean>;
  toast: (text: string, kind?: Toast['kind']) => void;
}

/** Messages pushed by the server over the WebSocket. */
type ServerMessage =
  | { t: 'states'; states: Record<string, StateEntry> }
  | { t: 'status'; status: Status }
  | { t: 'config' }
  | { t: 'dashboard'; dashboard: CustomDashboard }
  | { t: 'motion'; event: MotionEvent }
  | { t: 'alerts'; alerts: ActiveAlert[] }
  | { t: 'printer'; printer: PrinterData }
  | { t: 'printerPopup'; popup: PrinterPopupEvent }
  | { t: 'spotify'; spotify: SpotifyState }
  | { t: 'waste'; waste: WasteData }
  | { t: 'ventilation'; ventilation: VentilationData }
  | { t: 'radar'; agent: string; frame: RadarFrame };

const DISMISSED_KEY = 'dismissedAlerts';
const MOTION_HISTORY_LIMIT = 5000;
/** Hidden notifications from localStorage (tolerates missing / broken data). */
const loadDismissed = (): Record<string, number> => {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) || '{}') ?? {};
  } catch {
    return {};
  }
};

/** True if the notification still has to be acknowledged ("quittiert"). */
export const needsAck = (a: ActiveAlert) => Boolean(a.requireAck && !a.acked);

/** True if the user hid exactly this occurrence of the notification (alerts waiting for acknowledgement can not be hidden). */
export const isDismissed = (a: ActiveAlert, dismissed: Record<string, number>) => !needsAck(a) && dismissed[a.id] === a.since;

let toastId = 0;
let ws: WebSocket | null = null;
/** Number of failed connection attempts in a row (drives the reconnect delay). */
let retry = 0;
/** Open radar views; the server streams the live radar frames to this browser while there is one. */
let radarWatchers = 0;
/** Closes the printer pop-up after its display time (a store timer: it also runs while the screensaver hides the app). */
let printerPopupTimer = 0;

/** The global store hook; select single fields (`useStore((s) => s.view)`) to avoid needless re-renders. */
export const useStore = create<Store>((set, get) => ({
  ready: false,
  loadError: null,
  wsConnected: false,
  config: null,
  states: {},
  status: null,
  cameras: [],
  motion: [],
  popup: null,
  popupOverride: null,
  cameraPopupsSuppressedUntil: loadCameraPopupPause(),
  alerts: [],
  printer: null,
  printerPopup: null,
  printerPopupHiddenJob: loadHiddenPrinterJob(),
  spotify: null,
  waste: null,
  ventilation: null,
  extensions: [],
  radar: {},
  dismissedAlerts: loadDismissed(),
  toasts: [],
  view: viewFromHash() ?? 'home',
  theme: (localStorage.getItem('theme') as Theme) || 'dark',
  roomFilter: null,
  focusCamera: null,
  notificationsOpen: false,
  changelogOpen: false,
  display: loadDisplay(),
  menuOpen: false,
  dashboardDraft: null,

  /** Loads config, states, status, cameras and recent motion; opens the WebSocket on first call. */
  async boot() {
    try {
      const b = await api.bootstrap();
      set({
        ready: true, loadError: null, config: b.config, states: b.states, status: b.status, cameras: b.cameras, motion: b.recentMotion, alerts: b.alerts ?? [], printer: b.printer ?? null,
        spotify: b.spotify ? { ...b.spotify, receivedAt: Date.now() } : null,
        waste: b.waste ?? null,
        ventilation: b.ventilation ?? null,
        extensions: b.extensions ?? [],
      });
    } catch (err) {
      set({ loadError: (err as Error).message });
    }
    if (!ws) connect();
  },

  async refreshCameras() {
    try {
      set({ cameras: await api.cameras() });
    } catch {
      /* keep the old list */
    }
  },

  setView(view, roomId = null) {
    location.hash = view;
    // choosing a page closes the menu overlay
    set({ view, roomFilter: roomId, menuOpen: false });
  },

  setTheme(theme) {
    localStorage.setItem('theme', theme);
    set({ theme });
  },

  /** Optimistic write: the UI reacts immediately, the server confirms (or the old value returns). */
  set(id, value) {
    if (!id) return;
    const prev = get().states[id];
    set((s) => ({ states: { ...s.states, [id]: { val: value, ts: Date.now(), ack: false } } }));
    api.setState(id, value).catch((err: Error) => {
      set((s) => {
        const states = { ...s.states };
        if (prev) states[id] = prev;
        else delete states[id];
        return { states };
      });
      get().toast(`Befehl fehlgeschlagen: ${err.message}`, 'error');
    });
  },

  async runScene(id, name) {
    try {
      const r = await api.runScene(id);
      get().toast(r.ok ? `Szene „${name}“ aktiviert` : `Szene „${name}“ teilweise ausgeführt`, r.ok ? 'success' : 'error');
    } catch (err) {
      get().toast((err as Error).message, 'error');
    }
  },

  dismissPopup: () => set({ popup: null, popupOverride: null }),

  suppressCameraPopups(minutes) {
    if (!CAMERA_POPUP_PAUSE_MINUTES.some((value) => value === minutes)) return;
    const until = Date.now() + minutes * 60000;
    saveCameraPopupPause(until);
    set({ cameraPopupsSuppressedUntil: until, popup: null, popupOverride: null });
    get().toast('Kamera-Popups vorübergehend unterdrückt', 'success');
  },

  resumeCameraPopups() {
    saveCameraPopupPause(0);
    set({ cameraPopupsSuppressedUntil: 0 });
  },

  previewPopup(position, size) {
    const cam = get().cameras[0];
    set({
      popupOverride: { position, size },
      popup: { cameraId: cam?.id ?? '1', name: cam?.name ?? 'Kamera', ts: Date.now(), source: 'Vorschau', kind: 'motion', reason: null, popup: true },
    });
  },

  showPrinterPopup(e, look) {
    const seconds = e.reason === 'preview' ? 10 : get().config?.octoprint.popupSeconds ?? 20;
    clearTimeout(printerPopupTimer);
    set({ printerPopup: { ...e, until: Date.now() + seconds * 1000, look } });
    printerPopupTimer = window.setTimeout(() => {
      if (get().printerPopup?.id === e.id) set({ printerPopup: null });
    }, seconds * 1000);
  },

  dismissPrinterPopup() {
    clearTimeout(printerPopupTimer);
    set({ printerPopup: null });
  },

  hidePrinterPopupsForJob(jobId) {
    saveHiddenPrinterJob(jobId);
    set({ printerPopupHiddenJob: jobId });
    get().dismissPrinterPopup();
    get().toast('Drucker-Popups bis zum Ende dieses Drucks ausgeblendet', 'success');
  },

  async spotifyCommand(cmd) {
    const before = get().spotify;
    const shown = before ? applyCommand(before, cmd) : null;
    if (shown) set({ spotify: shown });
    try {
      await api.spotifyCommand(cmd);
      return true;
    } catch (err) {
      get().toast((err as Error).message, 'error');
      // Overlapping commands build on each other's assumed state, so a snapshot could bring back
      // the effect of another failed command: load the real state instead.
      try {
        const real = await api.spotifyState();
        set({ spotify: { ...real, receivedAt: Date.now() } });
      } catch {
        if (before && get().spotify === shown) set({ spotify: before });
      }
      return false;
    }
  },

  dismissAlert(a) {
    // entries of alerts that are no longer active are dropped, so the stored map stays small
    const active = new Set(get().alerts.map((x) => x.id));
    const next = Object.fromEntries(Object.entries({ ...get().dismissedAlerts, [a.id]: a.since }).filter(([id]) => active.has(id)));
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
    set({ dismissedAlerts: next });
  },

  async ackAlert(id) {
    try {
      // the server pushes the new list to every browser, including this one
      if (id) await api.ackAlert(id);
      else await api.ackAllAlerts();
    } catch (err) {
      get().toast(`Quittieren fehlgeschlagen: ${(err as Error).message}`, 'error');
    }
  },

  openTarget(view, room = null) {
    if (view && isView(view)) get().setView(view, view === 'rooms' ? room : null);
  },

  openCamera: (id) => set({ focusCamera: id }),
  showNotifications: (notificationsOpen) => set({ notificationsOpen }),
  showChangelog: (changelogOpen) => set({ changelogOpen }),

  setDisplay(p) {
    const display = { ...get().display, ...p };
    saveDisplay(display);
    set({ display });
  },
  setMenuOpen: (menuOpen) => set({ menuOpen }),
  editDashboard: (dashboardDraft) => set({ dashboardDraft }),

  async saveDashboard(dashboard) {
    try {
      const r = await api.saveDashboard(dashboard);
      const config = get().config;
      if (config) set({ config: { ...config, customDashboard: r.dashboard } });
      get().toast('Startseite gespeichert', 'success');
      return true;
    } catch (err) {
      get().toast(`Speichern fehlgeschlagen: ${(err as Error).message}`, 'error');
      return false;
    }
  },

  /** Shows a toast for 4 seconds; at most four toasts are visible at once. */
  toast(text, kind = 'info') {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }].slice(-4) }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000);
  },
}));

/**
 * Opens the push channel to the server and keeps it alive (reconnect with growing delay).
 * Message types: `states` (changed datapoints), `status` (connections), `config` (reload), `dashboard`
 * (the freely designable start page was saved),
 * `motion` (camera detected movement -> pop-up), `alerts` (active notifications),
 * `printer` (state of the 3D printer), `printerPopup` (webcam pop-up of the printer), `spotify` (Spotify playback),
 * `radar` (live frame of a presence radar, only while this browser watches, see `watchRadar`).
 */
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => {
    const reconnect = retry > 0;
    retry = 0;
    useStore.setState({ wsConnected: true });
    if (radarWatchers > 0) sendRadarWatch();
    if (reconnect) {
      useStore.getState().boot();
      // the server may have been restarted for an update: switch to the new version
      void reloadIfUpdated();
    }
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data) as ServerMessage;
    const s = useStore.getState();
    if (msg.t === 'states') useStore.setState({ states: { ...s.states, ...msg.states } });
    else if (msg.t === 'status') {
      // the Surveillance Station may finish loading its cameras after the page was opened
      const prev = s.status?.surveillance;
      const next = msg.status.surveillance;
      useStore.setState({ status: msg.status });
      if (!prev || prev.connected !== next.connected || prev.cameras !== next.cameras) s.refreshCameras();
    }
    else if (msg.t === 'config') s.boot();
    else if (msg.t === 'dashboard') {
      if (s.config) useStore.setState({ config: { ...s.config, customDashboard: msg.dashboard } });
    }
    else if (msg.t === 'motion') {
      const e: MotionEvent = msg.event;
      // a camera the list does not know yet (e.g. list still empty) -> reload the list
      if (!s.cameras.some((c) => c.id === e.cameraId)) setTimeout(() => useStore.getState().refreshCameras(), 300);
      // The server already decided whether this kind of event may pop up. A running people
      // pop-up is not replaced by a normal motion event, but a people event replaces anything.
      const show = shouldShowCameraPopup(e, s.popup, s.cameraPopupsSuppressedUntil);
      // security first: a camera pop-up replaces the webcam pop-up of the printer
      if (show && s.printerPopup) s.dismissPrinterPopup();
      useStore.setState({
        motion: [e, ...s.motion].slice(0, MOTION_HISTORY_LIMIT),
        popup: show ? e : s.popup,
        popupOverride: show ? null : s.popupOverride,
      });
    }
    else if (msg.t === 'printer') {
      // the print whose pop-ups were hidden ended (or another one started): show them again next time
      if (s.printerPopupHiddenJob && msg.printer.jobId !== s.printerPopupHiddenJob) {
        saveHiddenPrinterJob(null);
        useStore.setState({ printerPopupHiddenJob: null });
      }
      useStore.setState({ printer: msg.printer });
    }
    else if (msg.t === 'printerPopup') {
      if (shouldShowPrinterPopup(msg.popup, { hiddenJob: s.printerPopupHiddenJob, cameraPopup: s.popup != null, onPrinterPage: s.view === 'printer' })) s.showPrinterPopup(msg.popup);
    }
    else if (msg.t === 'spotify') useStore.setState({ spotify: { ...msg.spotify, receivedAt: Date.now() } });
    else if (msg.t === 'waste') useStore.setState({ waste: msg.waste });
    else if (msg.t === 'ventilation') useStore.setState({ ventilation: msg.ventilation });
    else if (msg.t === 'radar') useStore.setState({ radar: { ...s.radar, [msg.agent]: { frame: msg.frame, at: Date.now() } } });
    else if (msg.t === 'alerts') {
      // announce alerts that were not active before (info notifications only appear in the list)
      const known = new Set(s.alerts.map((a) => a.id));
      for (const a of msg.alerts) {
        if (!known.has(a.id) && a.severity !== 'info') s.toast(a.message, a.severity === 'alarm' ? 'error' : 'info');
      }
      useStore.setState({ alerts: msg.alerts });
    }
  };
  ws.onclose = () => {
    ws = null;
    useStore.setState({ wsConnected: false });
    retry++;
    setTimeout(connect, Math.min(10000, 1000 * retry));
  };
}

/** Tells the server whether this browser shows a radar page (it then streams the live radar frames). */
function sendRadarWatch() {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'radar', watch: radarWatchers > 0 }));
}

/** Asks the server for the live frames of the presence radars until the returned function is called. */
export function watchRadar() {
  radarWatchers++;
  if (radarWatchers === 1) sendRadarWatch();
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    radarWatchers--;
    if (radarWatchers === 0) sendRadarWatch();
  };
}

/** Subscribes a component to a single datapoint value; it only re-renders when that value changes. */
export const useVal = <T = unknown,>(id?: string): T | undefined => useStore((s) => (id ? (s.states[id]?.val as T) : undefined));

/**
 * Reads several datapoints at once: maps `{ key: stateId }` to `{ key: value }`.
 * The result is shallow compared, so the component only re-renders when one of the values changes.
 */
export const useStateValues = (ids: Record<string, string>): Record<string, unknown> =>
  useStore(useShallow((s) => Object.fromEntries(Object.entries(ids).map(([k, id]) => [k, s.states[id]?.val]))));

/**
 * Entries of the given datapoints only (missing ones are left out). The result is shallow compared, so
 * the component only re-renders when one of these datapoints changes – not on every value of the house.
 * Pass a stable (memoised) id list.
 */
export const useStateEntries = (ids: readonly string[]): Record<string, StateEntry> =>
  useStore(
    useShallow((s) => {
      const out: Record<string, StateEntry> = {};
      for (const id of ids) {
        const e = s.states[id];
        if (e) out[id] = e;
      }
      return out;
    }),
  );

/** ioBroker booleans may arrive as true/1/"1"/"true"/"on". */
export const isOn = (v: unknown) => v === true || v === 1 || v === '1' || v === 'true' || v === 'on';
