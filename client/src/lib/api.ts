/**
 * Thin REST client for the HomeApp server. Credentials of ioBroker and the
 * Synology are never handled here – the server keeps them.
 */
import type { CustomDashboard } from './widgets';
import type {
  ActiveAlert, AppConfig, CameraInfo, Device, EnergyConfig, MotionEvent, ObjectHit, PrinterCommand, PrinterData, PrinterTempHistory, Room, Scene, Series, SpotifyCollection, SpotifyCommand,
  SpotifyDevice, SpotifySearchResult, SpotifyState, SpotifyTrack, StateEntry, Status, KioskAgent, PushoverConfig, PushoverStatus, VentilationData, WasteData, WasteDay, WasteItem,
} from './types';

/** JSON fetch wrapper; turns non-2xx responses into an Error carrying the server's `error` message. */
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
  });
  if (!res.ok) {
    let msg = `Fehler ${res.status}`;
    try {
      msg = (await res.json()).error || msg;
    } catch {
      /* no json body */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

/** Everything the app needs on start-up, loaded with one request. */
export interface Bootstrap {
  config: AppConfig;
  states: Record<string, StateEntry>;
  status: Status;
  cameras: CameraInfo[];
  recentMotion: MotionEvent[];
  alerts: ActiveAlert[];
  /** 3D printer state; missing with older servers. */
  printer?: PrinterData;
  /** Spotify playback state; missing with older servers. */
  spotify?: SpotifyState;
  /** Upcoming waste pickups; missing with older servers. */
  waste?: WasteData | null;
  /** Ventilation advice; missing with older servers. */
  ventilation?: VentilationData | null;
}

/** Result of checking a waste calendar address. */
export interface WastePreview {
  url: string;
  count: number;
  upcoming: number;
  last: string | null;
  kinds: WasteItem[];
  next: WasteDay[];
}

/** A config field whose default comes from an environment variable (`manual` = overridden in the app). */
export interface EnvDefault {
  env: string;
  field: string;
  manual: boolean;
  value?: string | number | boolean;
  secret?: boolean;
}

/** Live preview of the pop-up schedule rules. */
export interface PopupPreview {
  /** Server time as text. */
  now: string;
  /** Number of enabled rules. */
  rules: number;
  motion: boolean;
  people: boolean;
}

/** All REST endpoints of the server. */
export const api = {
  bootstrap: () => request<Bootstrap>('/api/bootstrap'),
  /** Writes a datapoint value through the server. */
  setState: (id: string, value: unknown) => request('/api/state', { method: 'POST', body: JSON.stringify({ id, value }) }),
  runScene: (id: string) => request<{ ok: boolean; failed: number }>(`/api/scenes/${encodeURIComponent(id)}/run`, { method: 'POST' }),
  /** Recorded values of the given datapoints for the last `hours`. */
  history: (ids: string[], hours: number) =>
    request<Record<string, Series>>(`/api/history?ids=${encodeURIComponent(ids.join(','))}&hours=${hours}`),
  /** Searches ioBroker objects by id and name (max. 25 hits). */
  search: (q: string) => request<ObjectHit[]>(`/api/iobroker/search?q=${encodeURIComponent(q)}&limit=25`),
  getConfig: () => request<{ config: AppConfig; webhookToken: string; kioskToken?: string; envDefaults: EnvDefault[] }>('/api/config'),
  /** Wall display agents that reported to the server. */
  kioskAgents: () => request<{ agents: KioskAgent[] }>('/api/kiosk'),
  waste: () => request<WasteData>('/api/waste'),
  wasteRefresh: () => request<WasteData>('/api/waste/refresh', { method: 'POST' }),
  wastePreview: (url: string) => request<WastePreview>('/api/waste/preview', { method: 'POST', body: JSON.stringify({ url }) }),
  pushoverStatus: () => request<PushoverStatus>('/api/pushover'),
  /** Sends a test message with the (unsaved) settings; empty keys = the stored ones. */
  pushoverTest: (cfg: PushoverConfig) => request<{ ok: boolean }>('/api/pushover/test', { method: 'POST', body: JSON.stringify(cfg) }),
  /** `resetEnv`: fields (e.g. "iobroker.port") that go back to the default of the environment variable. */
  saveConfig: (config: AppConfig, resetEnv: string[] = []) => request('/api/config', { method: 'PUT', body: JSON.stringify({ ...config, resetEnv }) }),
  /** Saves the freely designable start page (pushed to every browser); returns the cleaned version. */
  saveDashboard: (dashboard: CustomDashboard) => request<{ ok: boolean; dashboard: CustomDashboard }>('/api/dashboard', { method: 'PUT', body: JSON.stringify(dashboard) }),
  cameras: () => request<CameraInfo[]>('/api/cameras'),
  /** Scans ioBroker for rooms, devices, scenes, energy and weather datapoints. */
  discover: () => request<Discovery>('/api/discovery', { method: 'POST' }),
  /** Which kinds of detection may pop up right now according to the saved rules (server time). */
  popupPreview: () => request<PopupPreview>('/api/popup-preview'),
  /** Which controlled datapoints the ioBroker user may not write (object ACL), incl. a fix script. */
  permissions: () => request<PermissionReport>('/api/iobroker/permissions'),
  /** Internet forecast for the configured location (`configured: false` until a location is set). */
  weather: () => request<WeatherData>('/api/weather'),
  geocode: (q: string) => request<GeoHit[]>(`/api/weather/geocode?q=${encodeURIComponent(q)}`),
  radar: () => request<RadarIndex>('/api/weather/radar'),
  /** Acknowledges one notification (for every browser). */
  ackAlert: (id: string) => request<{ ok: boolean }>(`/api/alerts/${encodeURIComponent(id)}/ack`, { method: 'POST' }),
  /** Acknowledges every notification that waits for it. */
  ackAllAlerts: () => request<{ ok: boolean; acknowledged: number }>('/api/alerts/ack', { method: 'POST' }),
  /** Temperature curves of the 3D printer (last ~30 minutes). */
  printerTemps: () => request<PrinterTempHistory>('/api/printer/temps'),
  /** Controls a Bambu Lab printer (pause, resume, stop, light, speed); answers with the new state. */
  printerCommand: (cmd: PrinterCommand) => request<PrinterData>('/api/printer/command', { method: 'POST', body: JSON.stringify(cmd) }),
  /** Controls Spotify playback (the server pushes the new state). */
  spotifyCommand: (cmd: SpotifyCommand) => request<{ ok: boolean }>('/api/spotify/command', { method: 'POST', body: JSON.stringify(cmd) }),
  /** Current Spotify playback state. */
  spotifyState: () => request<SpotifyState>('/api/spotify'),
  /** Spotify search: tracks, albums, artists and playlists (at most 10 each). */
  spotifySearch: (q: string) => request<SpotifySearchResult>(`/api/spotify/search?q=${encodeURIComponent(q)}`),
  spotifyPlaylists: () => request<SpotifyCollection[]>('/api/spotify/playlists'),
  spotifyDevices: () => request<SpotifyDevice[]>('/api/spotify/devices'),
  spotifyQueue: () => request<SpotifyTrack[]>('/api/spotify/queue'),
  spotifyRecent: () => request<SpotifyTrack[]>('/api/spotify/recent'),
  /** Removes the Spotify login from the server. */
  spotifyLogout: () => request<{ ok: boolean }>('/api/spotify/logout', { method: 'POST' }),
};

/** Address that starts the Spotify login; Spotify returns to this app's address (must be registered as redirect URI). */
export const spotifyLoginUrl = () => `/api/spotify/login?origin=${encodeURIComponent(location.origin)}`;
/** Redirect URI to register in the Spotify developer dashboard for the address this browser uses. */
export const spotifyRedirectUri = () => `${location.origin}/api/spotify/callback`;

/** Result of the location search. */
export interface GeoHit {
  name: string;
  region: string;
  latitude: number;
  longitude: number;
  elevation: number | null;
}

/** RainViewer frame index: tile host plus the path of each radar frame (time in Unix seconds). */
export interface RadarIndex {
  host: string;
  frames: { time: number; path: string }[];
}

/** Forecast as delivered by the server (times are Unix seconds, `timezone` is the IANA name of the location). */
export interface WeatherData {
  configured: boolean;
  demo?: boolean;
  stale?: boolean;
  timezone: string;
  fetchedAt: number;
  current: {
    time: number;
    temp: number | null;
    feelsLike: number | null;
    humidity: number | null;
    pressure: number | null;
    wind: number | null;
    gust: number | null;
    windDir: number | null;
    precip: number | null;
    cloud: number | null;
    code: number | null;
    isDay: boolean;
    uv: number | null;
  };
  hourly: { t: number; temp: number | null; pop: number | null; precip: number | null; code: number | null; uv: number | null; isDay: boolean }[];
  daily: {
    t: number;
    code: number | null;
    tMax: number | null;
    tMin: number | null;
    sunrise: number | null;
    sunset: number | null;
    daylight: number | null;
    uvMax: number | null;
    precip: number | null;
    pop: number | null;
    wind: number | null;
  }[];
  /** Precipitation (mm) per 15 minutes. */
  nowcast: { t: number; precip: number }[];
}

/** Result of the write-permission check for the controlled datapoints. */
export interface PermissionReport {
  anonymous?: boolean;
  user?: string;
  groups?: string[];
  groupsAllowWrite?: boolean;
  total: number;
  missing?: string[];
  blocked: { id: string; owner?: string; ownerGroup?: string; state?: number }[];
  script: string;
}

/** Result of the automatic discovery (a proposal, not yet saved). */
export interface Discovery {
  rooms: Room[];
  devices: Device[];
  energy: EnergyConfig | null;
  scenes: Scene[];
  weather: { states: Record<string, string> } | null;
}

/** Resolution / compression level of a camera snapshot. */
export type SnapshotQuality = 'low' | 'balanced' | 'high';

/** Address of a single camera picture; the refreshing image adds a timestamp that defeats the browser cache. */
export const snapshotPath = (id: string, quality: SnapshotQuality = 'balanced') =>
  `/api/cameras/${encodeURIComponent(id)}/snapshot?q=${quality}`;
/** URL of the MJPEG live stream of a camera. */
export const streamUrl = (id: string) => `/api/cameras/${encodeURIComponent(id)}/stream`;

/** Webcam picture of the 3D printer without cache buster (the refreshing image adds one). */
export const PRINTER_SNAPSHOT_URL = '/api/printer/snapshot';
/** MJPEG live stream of the printer webcam. */
export const PRINTER_STREAM_URL = '/api/printer/stream';
