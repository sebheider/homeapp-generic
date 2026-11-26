/** 3D printer: OctoPrint / Bambu Lab connection, pushed state and the webcam pop-up. */
import type { PopupPosition, PopupSize } from './cameras';
import type { Series } from './server';

/** Kind of 3D printer connection. */
export type PrinterType = 'octoprint' | 'bambu';

/**
 * 3D printer (see server octoprint.js): OctoPrint connection plus the settings every printer kind
 * shares (on/off, name, webcam display, overview, pop-ups). The API key is write-only (`apiKeySet`
 * tells whether one is stored).
 */
export interface OctoPrintConfig {
  enabled: boolean;
  /** OctoPrint or Bambu Lab (connection in `bambu`); missing with older servers (= OctoPrint). */
  type?: PrinterType;
  /** Own display name; empty = the name from OctoPrint / the printer model. */
  name: string;
  host: string;
  port: number;
  https: boolean;
  verifySsl: boolean;
  apiKey?: string;
  apiKeySet?: boolean;
  pollSeconds: number;
  /** Own webcam addresses; empty = detected from the OctoPrint settings. */
  snapshotUrl: string;
  streamUrl: string;
  /** Refresh interval (seconds) of the webcam picture in the app (without live video or while the stream is unavailable). */
  webcamRefreshSeconds: number;
  /** Show the webcam as MJPEG live video; missing in older configs (default on). */
  webcamLive?: boolean;
  /** Show the print on the overview while it runs. */
  dashboard: boolean;
  /** Webcam pop-up every `popupMinutes` while printing, shown for `popupSeconds`. */
  popup: boolean;
  popupMinutes: number;
  popupSeconds: number;
  /** Pop-up when the print is finished, cancelled or failed. */
  popupOnFinish: boolean;
  popupPosition: PopupPosition;
  popupSize: PopupSize;
}

/** Camera of a Bambu Lab printer: automatic, JPEG pictures (P1/A1), RTSP via ffmpeg (X1/H2/P2), own MJPEG address or off. */
export type BambuCamera = 'auto' | 'jpeg' | 'rtsp' | 'url' | 'off';

/** Bambu Lab printer via the local developer API (see server bambu.js). The access code is write-only. */
export interface BambuConfig {
  /** IP address of the printer. */
  host: string;
  serial: string;
  accessCode?: string;
  accessCodeSet?: boolean;
  camera: BambuCamera;
  /** Own MJPEG or picture address (camera `url`, e.g. go2rtc). */
  streamUrl: string;
  /** Allow pause, stop, light and speed from the app. */
  controls: boolean;
}

/** One AMS slot or the external spool of a Bambu Lab printer. */
export interface BambuTray {
  id: string;
  empty: boolean;
  /** Currently loaded. */
  active: boolean;
  type?: string;
  name?: string | null;
  /** `#rrggbb` */
  color?: string | null;
  /** Remaining filament in percent (null = unknown, e.g. third-party spool). */
  remain?: number | null;
  /** Nozzle the spool feeds on printers with two nozzles (H2D, X2D). */
  nozzle?: 'left' | 'right' | null;
}

/** External spool with its name (`Extern`, or `Extern links` / `Extern rechts` with two nozzles). */
export interface BambuExternalTray extends BambuTray {
  label: string;
}

/** Details only a Bambu Lab printer reports (see server bambu.js `normalizeBambu`). */
export interface BambuDetails {
  model: string | null;
  firmware: string | null;
  serial: string | null;
  /** Current step of the print (German), null when not printing. */
  stage: string | null;
  layer: { current: number; total: number } | null;
  /** Speed level 1 silent, 2 standard, 3 sport, 4 ludicrous. */
  speed: { level: number; label: string; percent: number | null } | null;
  fans: { key: string; label: string; percent: number | null }[];
  /** Chamber light on (null = unknown). */
  light: boolean | null;
  ams: {
    units: { id: number; name: string; humidity: number | null; humidityLevel: number | null; temp: number | null; trays: BambuTray[] }[];
    external: BambuExternalTray[];
  };
  /** Health messages, e.g. `{ code: '0300_0100_0001_0007', severity: 'serious' }`. */
  hms: { code: string; severity: 'fatal' | 'serious' | 'common' | 'info' | 'unknown' }[];
  /** WiFi signal in dBm. */
  wifi: number | null;
  /** One entry, or `Düse rechts` / `Düse links` with `active` on printers with two nozzles. */
  nozzles: { label: string; diameter: number | null; type: string | null; active: boolean | null }[];
  sdcard: boolean | null;
  timelapse: boolean | null;
  camera: BambuCamera | 'disabled' | null;
}

/** Commands for a Bambu Lab printer (POST /api/printer/command). */
export type PrinterCommand = { action: 'pause' | 'resume' | 'stop' } | { action: 'light'; on: boolean } | { action: 'speed'; level: number };

/** Normalised printer state (see server octoprint.js `printerState`). */
export type PrinterStateKey = 'offline' | 'connecting' | 'idle' | 'printing' | 'pausing' | 'paused' | 'cancelling' | 'finishing' | 'error' | 'unknown';

/** Temperature of a hotend, the bed or the chamber (°C; target 0 = heater off). */
export interface PrinterTemp {
  key: string;
  label: string;
  actual: number | null;
  target: number | null;
}

/** State of the 3D printer as pushed by the server. */
export interface PrinterData {
  /** A printer is configured (or the demo printer runs). */
  enabled: boolean;
  demo: boolean;
  /** Kind of connection; missing with older servers (= OctoPrint). */
  kind?: PrinterType;
  /** The printer may be controlled from the app (Bambu Lab with control allowed). */
  controls?: boolean;
  /** Printer reachable (OctoPrint: key accepted). */
  connected: boolean;
  /** Connection problem (German). */
  error: string | null;
  name: string;
  version: string | null;
  /** User the API key belongs to. */
  user: string | null;
  state: PrinterStateKey;
  /** State text of OctoPrint (English) or of the Bambu printer (German). */
  stateText: string;
  /** A print job runs (printing, pausing, paused, cancelling, finishing). */
  active: boolean;
  /** Id of the running print (server side, changes with every print). */
  jobId: string | null;
  job: {
    file: string;
    path: string;
    origin: 'local' | 'sdcard' | 'cloud';
    size: number | null;
    user: string | null;
    estimatedPrintTime: number | null;
    /** Filament length in mm. */
    filament: number | null;
  } | null;
  progress: {
    /** 0 … 100 */
    completion: number | null;
    /** Seconds. */
    printTime: number | null;
    printTimeLeft: number | null;
    printTimeLeftOrigin: string | null;
  } | null;
  temps: PrinterTemp[];
  /** Error message of the printer / OctoPrint itself. */
  printerError: string | null;
  /** Bambu Lab details (AMS, fans, light, layer …); null for OctoPrint. */
  bambu?: BambuDetails | null;
  webcam: { available: boolean; flipH: boolean; flipV: boolean; rotate90: boolean; ratio: '16:9' | '4:3' };
  updatedAt: number;
}

/** Why the webcam pop-up appears: regularly while printing, or because the print ended. */
export type PrinterPopupReason = 'interval' | 'done' | 'cancelled' | 'error' | 'preview';

/** Webcam pop-up of the printer (pushed by the server). */
export interface PrinterPopupEvent {
  id: string;
  ts: number;
  reason: PrinterPopupReason;
  jobId: string | null;
}

/** Temperature curves of the last ~30 minutes per sensor. */
export type PrinterTempHistory = Record<string, { label: string; actual: Series; target: Series }>;
