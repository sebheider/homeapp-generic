/** Shape of the global store. */
import type { DisplaySettings } from '../display';
import type { ExtensionManifest } from '../extensions';
import type { CustomDashboard, Widget } from '../widgets';
import type { ActiveAlert, AppConfig, CameraInfo, MotionEvent, PopupPosition, PopupSize, PrinterData, PrinterPopupEvent, RadarFrame, SpotifyCommand, SpotifyState, StateEntry, Status, VentilationData, WasteData } from '../types';
import type { View, Theme } from './views';

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

export interface Store {
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
