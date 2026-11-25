/**
 * Shared data types. They mirror the configuration format (`config.json`) and the
 * messages of the server API.
 */
import type { CustomDashboard } from './widgets';

export type DeviceType = 'light' | 'switch' | 'thermostat' | 'blind' | 'sensor' | 'climate' | 'heatpump' | 'mower';

/** A configured device. Which `states` / `options` keys are used depends on the type (see lib/deviceTypes.ts). */
export interface Device {
  id: string;
  type: DeviceType;
  name: string;
  room: string;
  icon?: string;
  /** Datapoint key (e.g. "power") -> ioBroker state id. */
  states: Record<string, string>;
  /** Type specific settings (ranges, units, mode lists); free-form because every type has its own keys. */
  options: Record<string, any>;
}

/** Entry of a value/label list (select choices, operating modes, fan levels). */
export interface ChoiceOption {
  value: string;
  label: string;
}

/** Operating mode of a climate device or heat pump. */
export interface ModeOption extends ChoiceOption {
  icon?: string;
  /** Climate devices: key of the setpoint datapoint used in this mode (e.g. "targetHeat"). */
  target?: string;
}

/** A room; `icon` is a name from the icon registry (lib/icons.tsx). */
export interface Room {
  id: string;
  name: string;
  icon: string;
  /** Storey for the digital twin of the "Nexus" overview: -1 basement, 0 ground floor, 1 … 3 upper floors (missing = ground floor). */
  floor?: number;
}

/** One step of a scene: write `value` to the datapoint `state`. */
export interface SceneAction {
  state: string;
  value: string | number | boolean;
}

/** A scene writes several datapoints at once. */
export interface Scene {
  id: string;
  name: string;
  icon: string;
  actions: SceneAction[];
}

/** Per-camera overrides stored in the configuration (the camera list itself comes from the Surveillance Station). */
export interface CameraConfig {
  id: string;
  name?: string;
  room?: string | null;
  hidden?: boolean;
  /** Master switch for pop-ups of this camera. */
  popup?: boolean;
  /** Pop-up for normal motion / for advanced detection (people). */
  popupMotion?: boolean;
  popupPeople?: boolean;
  /** ioBroker datapoints of detectors mapped to this camera. */
  motionState?: string | null;
  peopleState?: string | null;
}

/** Camera as reported by the server (Surveillance Station list merged with the overrides). */
export interface CameraInfo {
  id: string;
  name: string;
  room: string | null;
  enabled: boolean;
  popup: boolean;
  popupMotion: boolean;
  popupPeople: boolean;
  motionState: string | null;
  peopleState: string | null;
}

/** Energy system datapoints; `*Invert` flip the sign convention of the installation. */
export interface EnergyConfig {
  enabled: boolean;
  gridInvert: boolean;
  batteryInvert: boolean;
  states: Record<string, string>;
}

/** Connection to the Synology Surveillance Station. The password is write-only (`passwordSet` tells whether one is stored). */
export interface SurveillanceConfig {
  enabled: boolean;
  host: string;
  port: number;
  https: boolean;
  account: string;
  password?: string;
  passwordSet?: boolean;
  /** One-time 2-factor code, only sent when saving; never stored. */
  otp?: string;
  /** True once DSM issued a device token (no code needed any more). */
  deviceIdSet?: boolean;
  resetDeviceId?: boolean;
  verifySsl: boolean;
  pollSeconds: number;
  motionCooldownSeconds: number;
  eventReasons: string;
  /** Reason codes that count as advanced detection (people). */
  peopleReasons: string;
}

/** Weather location, radar switch and the mapping of a local weather station. */
export interface WeatherConfig {
  enabled: boolean;
  name: string;
  latitude: number | null;
  longitude: number | null;
  radar: boolean;
  /** Unit of the local wind sensors. */
  windUnit: 'kmh' | 'ms';
  /** Local weather station: datapoint key (see WEATHER_FIELDS) -> ioBroker state id. */
  states: Record<string, string>;
}

/** Where the camera pop-up appears. */
export type PopupPosition = 'center' | 'corner';
/** Size of the camera pop-up. */
export type PopupSize = 'medium' | 'large' | 'full';

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

/** Spotify Connect (see server spotify.js). The login (refresh token) never reaches the browser; `connected` tells whether one exists. */
export interface SpotifyConfig {
  enabled: boolean;
  /** Client id of the own app in the Spotify developer dashboard. */
  clientId: string;
  connected?: boolean;
  /** Display name of the connected Spotify account. */
  account: string;
  /** Name of the preferred device (e.g. the amplifier); empty = any. */
  device: string;
  /** Show the mini player on the overview only while this device plays. */
  onlyDevice: boolean;
  /** Mini player on the overview while music plays. */
  dashboard: boolean;
  /** Minutes the mini player stays after pausing (to resume). */
  pauseMinutes: number;
  pollSeconds: number;
}

/** Repeat mode of Spotify. */
export type SpotifyRepeat = 'off' | 'context' | 'track';

/** A track or podcast episode. */
export interface SpotifyTrack {
  id: string;
  uri: string;
  type: 'track' | 'episode';
  name: string;
  /** Artists (comma separated) or the podcast. */
  artists: string;
  album: string;
  albumUri: string | null;
  image: string | null;
  imageSmall: string | null;
  /** Milliseconds. */
  duration: number;
}

/** Album, artist or playlist that can be played as a whole. */
export interface SpotifyCollection {
  id: string;
  uri: string;
  kind: 'album' | 'artist' | 'playlist';
  name: string;
  subtitle: string;
  image: string | null;
  total: number | null;
}

/** A Spotify Connect device. */
export interface SpotifyDevice {
  id: string;
  name: string;
  type: string;
  active: boolean;
  restricted: boolean;
  volume: number | null;
  supportsVolume: boolean;
}

export interface SpotifySearchResult {
  tracks: SpotifyTrack[];
  albums: SpotifyCollection[];
  artists: SpotifyCollection[];
  playlists: SpotifyCollection[];
}

/** Playback state pushed by the server; `receivedAt` is set by the browser (base of the live position). */
export interface SpotifyState {
  /** Spotify is switched on (or the demo player runs). */
  enabled: boolean;
  demo: boolean;
  connected: boolean;
  error: string | null;
  account: string | null;
  /** A device has a playback session. */
  active: boolean;
  playing: boolean;
  device: { id: string | null; name: string; type: string; volume: number | null; supportsVolume: boolean } | null;
  track: SpotifyTrack | null;
  /** Position in ms when the state was read. */
  progress: number;
  shuffle: boolean;
  repeat: SpotifyRepeat;
  context: { uri: string; type: string } | null;
  can: { next: boolean; previous: boolean; seek: boolean; shuffle: boolean; repeat: boolean };
  /** Last time music was playing (server time, ms; 0 = not since the start). */
  lastPlayingAt: number;
  updatedAt: number;
  receivedAt?: number;
}

/** Control commands of the player (see server `sanitizeCommand`). */
export type SpotifyCommand =
  | { action: 'pause' | 'next' | 'previous' }
  | { action: 'play'; deviceId?: string; uris?: string[]; contextUri?: string; offsetUri?: string }
  | { action: 'seek'; position: number }
  | { action: 'volume'; volume: number }
  | { action: 'shuffle'; state: boolean }
  | { action: 'repeat'; state: SpotifyRepeat }
  | { action: 'transfer'; deviceId: string; play?: boolean }
  | { action: 'queue'; uri: string };

/** Severity of a notification (sorting, colour, icon). */
export type Severity = 'alarm' | 'warning' | 'info';
/** Comparison of an alert rule (see server alerts.js). */
export type AlertOp = '>' | '>=' | '<' | '<=' | '==' | '!=' | 'on' | 'off';

/** User-defined notification rule: watches one datapoint (see server alerts.js). */
export interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  /** ioBroker state id that is watched. */
  state: string;
  op: AlertOp;
  /** Limit / comparison value (unused for 'on' / 'off'). */
  value: number | string;
  /** Numeric rules: distance the value must move back before the alert clears. */
  hysteresis: number;
  /** The condition must hold this long before the alert is raised. */
  delaySeconds: number;
  severity: Severity;
  /** Text shown to the user; `{value}` is replaced by the current value. */
  message: string;
  /** Page (and room) a click on the notification jumps to; '' = none. */
  view: string;
  room: string;
  /** Stays visible until acknowledged, even after the condition is gone (default for alarms). */
  requireAck: boolean;
  /** Also sent as push notification (Pushover); missing = yes. */
  push?: boolean;
}

/** A notification that is currently active (pushed by the server). */
export interface ActiveAlert {
  id: string;
  name: string;
  severity: Severity;
  message: string;
  value: unknown;
  /** Time the alert was raised (ms). */
  since: number;
  view: string | null;
  room: string | null;
  /** Must be acknowledged ("quittiert"); `acked` tells whether that happened. */
  requireAck?: boolean;
  acked?: boolean;
  ackedAt?: number | null;
  /** The condition is gone, the alert only waits for its acknowledgement. */
  cleared?: boolean;
  clearedAt?: number | null;
  /** Generated hint instead of a user rule. */
  source?: 'waste' | 'ventilation';
}

/** Pages whose grouping and order can be configured. */
export type LayoutPage = 'lights' | 'climate' | 'rooms';
/** Grouping of a device page: built-in layout, by room, by device type or one single list. */
export type GroupMode = 'default' | 'room' | 'type' | 'none';

/** Grouping and order of a device page (see server layouts.js). */
export interface PageLayout {
  groupBy: GroupMode;
  /** Group keys (room ids / type keys) in the wanted order; others follow. */
  groupOrder: string[];
  /** Device ids in the wanted order; others follow in configuration order. */
  deviceOrder: string[];
  /** Device ids not shown on this page. */
  hidden: string[];
}

/** Complete app configuration as returned by `GET /api/config` (secrets are never included). */
export interface AppConfig {
  version: number;
  app: {
    name: string;
    motionPopup: boolean;
    motionPopupSeconds: number;
    peoplePopup: boolean;
    peoplePopupSeconds: number;
    popupRules: PopupRule[];
    popupPosition: PopupPosition;
    popupSize: PopupSize;
    /** Refresh interval (seconds) of the camera pictures inside the app (overview, camera page). */
    snapshotRefreshSeconds: number;
    /** Refresh interval (seconds) of the camera picture in the motion pop-up; missing in older configs (default 1). */
    popupSnapshotRefreshSeconds?: number;
    /** Motion pop-up shows the MJPEG live video instead of refreshing pictures; missing in older configs (default on). */
    popupLiveVideo?: boolean;
  };
  iobroker: {
    mode: 'demo' | 'socketio';
    host: string;
    port: number;
    secure: boolean;
    protocol?: 'ws' | 'socketio';
    user?: string;
    password?: string;
    passwordSet?: boolean;
    verifySsl?: boolean;
  };
  surveillance: SurveillanceConfig;
  /** 3D printer (shared settings and OctoPrint connection). */
  octoprint: OctoPrintConfig;
  /** Connection of a Bambu Lab printer (`octoprint.type: 'bambu'`). */
  bambu: BambuConfig;
  /** Spotify Connect. */
  spotify: SpotifyConfig;
  rooms: Room[];
  devices: Device[];
  energy: EnergyConfig;
  weather: WeatherConfig;
  cameras: CameraConfig[];
  scenes: Scene[];
  alerts: AlertRule[];
  layouts: Record<LayoutPage, PageLayout>;
  /** Freely designable start page (see lib/widgets.ts); missing in older configs. */
  customDashboard?: CustomDashboard;
  /** Settings of the Raspberry Pi agents of the wall displays; missing with older servers. */
  kiosk?: KioskConfig;
  /** Waste collection calendar; missing with older servers. */
  waste?: WasteConfig;
  /** Ventilation advice; missing with older servers. */
  ventilation?: VentilationConfig;
  /** Push notifications via Pushover; missing with older servers. */
  pushover?: PushoverConfig;
}

/** Kinds of events that can be sent as push notification (see server pushover.js). */
export type PushEvent =
  | 'alarm' | 'warning' | 'info' | 'cleared' | 'waste' | 'ventilation'
  | 'printerDone' | 'printerError' | 'printerCancelled' | 'printerPaused' | 'printerProgress' | 'people' | 'motion';

/** Pushover priority: -2 no notification, -1 silent, 0 normal, 1 high, 2 emergency (repeated until confirmed). */
export type PushPriority = -2 | -1 | 0 | 1 | 2;

/**
 * Push notifications via Pushover. User key and API token are write-only: the server only reports
 * `userSet` / `tokenSet`; an empty field keeps the stored value.
 */
export interface PushoverConfig {
  enabled: boolean;
  user?: string;
  userSet?: boolean;
  token?: string;
  tokenSet?: boolean;
  /** Device name(s), comma separated; empty = all devices. */
  device: string;
  /** Pushover sound; empty = default of the account. */
  sound: string;
  /** Address of the app; notifications link to the matching page. */
  appUrl: string;
  /** 'HH:MM' (server time) or '' = no quiet hours. */
  quietFrom: string;
  quietUntil: string;
  /** Camera / printer webcam picture attached to camera and printer notifications. */
  attachImage: boolean;
  /** Camera notifications only when the pop-up would appear (pop-up switches and schedule). */
  cameraFollowPopup: boolean;
  /** Interval of the regular printer status updates (event `printerProgress`) in minutes, 5–720. */
  printerProgressMinutes: number;
  events: Record<PushEvent, { enabled: boolean; priority: PushPriority }>;
}

/** State of the push notifications (GET /api/pushover). */
export interface PushoverStatus {
  active: boolean;
  demo: boolean;
  lastSent: { ts: number; title: string; event: PushEvent } | null;
  lastError: { ts: number; message: string } | null;
}

/** Settings the server sends to the kiosk agents (see server kiosk.js). */
export interface KioskConfig {
  screenOff: boolean;
  screenOffSeconds: number;
  /** The screen stays on inside these windows, even without presence (agent's local time). */
  alwaysOn: TimeWindow[];
  /** Camera pop-ups switch the screen on. */
  wakeOnCamera: boolean;
  /** New notifications (and finished prints) switch the screen on. */
  wakeOnAlerts: boolean;
  /** Lowest severity of a notification that wakes the screen. */
  wakeSeverity: Severity;
  /** How long a woken screen stays on without presence. */
  wakeSeconds: number;
  /** No camera pop-up or notification switches the screen on inside these windows (presence and touch still do). */
  quietHours: TimeWindow[];
  /** Screen off inside these windows when there is no presence radar (or `screenOff` is false); touch wakes it. */
  offTimes: TimeWindow[];
  /** `dimBrightness` inside these windows, `fullBrightness` outside, when there is no light sensor (or `autoBrightness` is false). */
  dimTimes: TimeWindow[];
  /** % inside the dim times. */
  dimBrightness: number;
  /** % outside the dim times. */
  fullBrightness: number;
  autoBrightness: boolean;
  minBrightness: number;
  maxBrightness: number;
  luxDark: number;
  luxBright: number;
  /** cm; 0 = whole range of the radar. */
  presenceMaxDistance: number;
  intervalSeconds: number;
  /** m above sea level (CO₂ sensor). */
  co2Altitude: number;
  temperatureOffset: number;
}

/** A wall display agent that reported to the server. */
export interface KioskAgent {
  id: string;
  name: string;
  version: string;
  address: string;
  lastSeen: number;
  online: boolean;
  values: Record<string, number | boolean>;
  display: { method: string | null };
  errors: string[];
  /** Abilities, e.g. 'radar' = sends live radar frames (agent 1.3.0 and later); missing with older servers. */
  features?: string[];
}

/** Target of the presence radar: distance in cm and energy 0–100 (null: only known from the regular reports). */
export interface RadarTarget {
  distance: number;
  energy: number | null;
}

/**
 * Picture of a presence radar (LD2410), live from the agent while the radar page is open (see server kiosk.js
 * `cleanRadar`) or built from the regular reports.
 */
export interface RadarFrame {
  /** engineering: with the energy per distance gate; basic: targets only; pin: OUT pin, presence only; report: regular reports; none: no data (see `error`). */
  mode: 'engineering' | 'basic' | 'pin' | 'report' | 'none';
  presence: boolean | null;
  moving: RadarTarget | null;
  still: RadarTarget | null;
  /** Energy 0–100 of the distance gates 0 … N (engineering mode). */
  gates: { moving: number[]; still: number[] } | null;
  /** Width of a distance gate in cm (75, or 20 with the fine resolution). */
  gateCm: number;
  error: string | null;
}

/** Waste collection calendar (see server waste.js). */
export interface WasteConfig {
  enabled: boolean;
  url: string;
  /** "HH:MM" on the evening before a pickup. */
  remindFrom: string;
  /** "HH:MM" on the pickup day. */
  remindUntil: string;
  severity: 'warning' | 'info';
  /** Kind keys without hints. */
  hidden: string[];
}

/** One kind of waste of a pickup. */
export interface WasteItem {
  summary: string;
  key: string;
  label: string;
  color: string;
}

/** A pickup day. */
export interface WasteDay {
  date: string;
  items: WasteItem[];
}

/** Upcoming pickups as pushed by the server. */
export interface WasteData {
  enabled: boolean;
  demo: boolean;
  error: string | null;
  fetchedAt: number | null;
  /** Last date of the calendar ('YYYY-MM-DD'). */
  last: string | null;
  upcoming: WasteDay[];
  /** Only from GET /api/waste. */
  kinds?: (WasteItem & { upcoming: number })[];
}

/** One room of the ventilation advice (configured; empty list = derived from the devices). */
export interface VentilationRoom {
  id: string;
  room: string;
  name: string;
  temperature: string;
  humidity: string;
  co2: string;
  window: string;
}

export interface VentilationConfig {
  enabled: boolean;
  outdoor: { temperature: string; humidity: string };
  rooms: VentilationRoom[];
  humidityMax: number;
  minDifference: number;
  co2Max: number;
  co2Warn: number;
  cooling: boolean;
  coolAbove: number;
  coolDifference: number;
  closeHints: boolean;
  severity: 'warning' | 'info';
}

/** Current advice of a room. */
export interface VentilationRoomState {
  id: string;
  room: string | null;
  name: string;
  temperature: number | null;
  humidity: number | null;
  co2: number | null;
  windowOpen: boolean | null;
  absHumidity: number | null;
  status: 'ventilate' | 'airing' | 'ok' | 'close' | 'unknown';
  reasons: string[];
  humidOutside: boolean;
  severity: Severity;
  since: number;
  message: string;
}

/** Ventilation advice as pushed by the server. */
export interface VentilationData {
  enabled: boolean;
  outdoor: { temperature: number | null; humidity: number | null; absHumidity: number | null; source: 'sensor' | 'internet' | null } | null;
  rooms: VentilationRoomState[];
}

/** Live value of a datapoint (`ack` = confirmed by the device). */
export interface StateEntry {
  val: unknown;
  ts: number;
  ack: boolean;
}

/** Kind of detection: normal motion or advanced detection (people). */
export type MotionKind = 'motion' | 'people';

/** Weekly time window (see server popup-rules.js inWindow): may run over midnight, from = to = whole day. */
export interface TimeWindow {
  /** JavaScript weekdays: 0 = Sunday ... 6 = Saturday; empty = every day. */
  days: number[];
  /** "HH:MM" */
  from: string;
  to: string;
}

/** Schedule rule for the camera pop-ups: when may which kind of detection pop up (see server popup-rules.js). */
export interface PopupRule {
  id: string;
  name: string;
  enabled: boolean;
  kinds: MotionKind[];
  /** JavaScript weekdays: 0 = Sunday ... 6 = Saturday. */
  days: number[];
  /** "HH:MM"; the window may run over midnight (from > to). */
  from: string;
  to: string;
  /** Camera ids; empty = all cameras. */
  cameras: string[];
}

/** German display names of the detection kinds. */
export const MOTION_LABEL: Record<MotionKind, string> = { motion: 'Bewegung', people: 'Person erkannt' };

/** Detection reported by a camera (`popup` = the server decided it may pop up). */
export interface MotionEvent {
  cameraId: string;
  name: string;
  ts: number;
  source: string;
  kind: MotionKind;
  reason: string | number | null;
  popup: boolean;
}

/** Connection health of the server's data sources. */
export interface Status {
  demo: boolean;
  source: { connected: boolean; error: string | null; objects: number };
  surveillance: {
    enabled: boolean;
    connected: boolean;
    error: string | null;
    cameras: number;
    /** How often each event reason code was seen (diagnostics for the people / motion mapping). */
    reasonStats?: Record<string, { count: number; last: number }>;
  };
  /** 3D printer (OctoPrint, Bambu Lab or the demo printer); missing with older servers. */
  printer?: { enabled: boolean; connected: boolean; error: string | null; demo: boolean };
  /** Spotify Connect (or the demo player); missing with older servers. */
  spotify?: { enabled: boolean; connected: boolean; error: string | null; demo: boolean; account: string | null };
}

/** Result of the ioBroker object search used by the datapoint picker. */
export interface ObjectHit {
  id: string;
  name: string;
  type?: string;
  role?: string;
  unit?: string;
  write?: boolean;
}

/** Time series as `[timestamp ms, value]` pairs. */
export type Series = [number, number][];
