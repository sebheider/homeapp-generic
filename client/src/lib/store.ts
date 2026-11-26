/**
 * Global client state (zustand).
 *
 * Holds the configuration, all live datapoint values, connection status, camera list,
 * motion events, the 3D printer and UI state (current view, theme). The server pushes changes
 * through one WebSocket; `set()` updates optimistically and rolls back on error.
 * The pages, the push channel and the hooks that read datapoint values live in lib/store/; this module creates the
 * store and re-exports them.
 */
import { create } from 'zustand';
import { api } from './api';
import { loadDisplay, saveDisplay } from './display';
import { CAMERA_POPUP_PAUSE_MINUTES, loadCameraPopupPause, saveCameraPopupPause } from './cameraPopups';
import { loadHiddenPrinterJob, saveHiddenPrinterJob } from './printer';
import { applyCommand } from './spotify';
import { isView, viewFromHash, type Theme } from './store/views';
import type { Store } from './store/types';
import { DISMISSED_KEY, loadDismissed } from './store/alerts';
import { ensureConnected } from './store/connection';

export { viewFromHash } from './store/views';
export type { BuiltinView, View, Theme } from './store/views';
export type { Toast, RadarSample } from './store/types';
export { needsAck, isDismissed } from './store/alerts';
export { watchRadar } from './store/connection';
export { useStateValues, useStateEntries, isOn } from './store/values';

let toastId = 0;
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
    ensureConnected();
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
