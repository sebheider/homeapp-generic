/** The complete app configuration and its smaller sections (energy, weather, page layouts). */
import type { CustomDashboard } from '../widgets';
import type { ExtensionConfig } from '../extensions';
import type { Device, Room, Scene } from './devices';
import type { CameraConfig, SurveillanceConfig, PopupPosition, PopupSize, PopupRule } from './cameras';
import type { OctoPrintConfig, BambuConfig } from './printer';
import type { SpotifyConfig } from './spotify';
import type { AlertRule, PushoverConfig } from './alerts';
import type { KioskConfig } from './kiosk';
import type { WasteConfig } from './waste';
import type { VentilationConfig } from './ventilation';

/** Energy system datapoints; `*Invert` flip the sign convention of the installation. */
export interface EnergyConfig {
  enabled: boolean;
  gridInvert: boolean;
  batteryInvert: boolean;
  states: Record<string, string>;
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
    mode: 'demo' | 'socketio' | 'homeassistant';
    host: string;
    port: number;
    secure: boolean;
    protocol?: 'ws' | 'socketio';
    user?: string;
    password?: string;
    passwordSet?: boolean;
    verifySsl?: boolean;
  };
  homeassistant: { url: string; token?: string; tokenSet?: boolean; verifySsl: boolean };
  /** Built-in modules: part of the app, they can only be switched off. */
  modules: { weather: boolean; printer: boolean; spotify: boolean; mower: boolean };
  /** Installed external modules: enabled state and the admin's settings; missing with older servers. */
  extensions?: Record<string, ExtensionConfig>;
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
