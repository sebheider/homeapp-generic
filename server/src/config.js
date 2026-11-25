/**
 * Configuration store.
 *
 * The configuration lives in `<DATA_DIR>/config.json` (a Docker volume, so it
 * survives container updates). Three views of it exist:
 *   - `raw`       what is stored in the file,
 *   - `effective` raw + environment defaults (+ demo content in demo mode); used by the app. It is
 *                 computed once and cached until the file or the environment changes – treat it as read-only,
 *   - `publicConfig()` / `editableConfig()`  effective / editable values without any secret, for the browser.
 *
 * Environment variables (all optional) only provide DEFAULTS – see README for the full table:
 *   IOBROKER_HOST, IOBROKER_MODE, IOBROKER_PORT, IOBROKER_SECURE, IOBROKER_PROTOCOL, IOBROKER_USER,
 *   IOBROKER_PASSWORD, IOBROKER_VERIFY_SSL, DEMO_MODE,
 *   SS_HOST, SS_PORT, SS_HTTPS, SS_ACCOUNT, SS_PASSWORD, SS_DEVICE_ID, SS_VERIFY_SSL
 *
 * Precedence: whatever was set by hand in the settings page is the master. The fields that were set
 * by hand are remembered in `userSet` (persisted in config.json); only the other fields follow the
 * environment. Secrets have no flag: a stored non-empty secret wins, otherwise the environment's applies.
 * Fields can be handed back to the environment with `resetEnv` (see {@link ConfigStore#update}).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { demoContent } from './demo-content.js';
import { sanitizeRules } from './popup-rules.js';
import { sanitizeWeather } from './weather.js';
import { sanitizeAlerts } from './alerts.js';
import { sanitizeLayouts } from './layouts.js';
import { sanitizeDashboard } from './dashboard.js';
import { sanitizeOctoPrint } from './octoprint.js';
import { sanitizeBambu } from './bambu.js';
import { sanitizeSpotify } from './spotify.js';
import { sanitizeKiosk } from './kiosk.js';
import { sanitizeWaste } from './waste.js';
import { sanitizeVentilation, ventilationStateIds } from './ventilation.js';
import { sanitizePushover } from './pushover.js';
import { sanitizeModules } from './modules.js';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

/** Where the camera pop-up appears and how large it is. */
export const POPUP_POSITIONS = ['center', 'corner'];
export const POPUP_SIZES = ['medium', 'large', 'full'];

/** Allowed range of the camera picture refresh intervals (seconds). */
const REFRESH_MIN = 0.5;
const REFRESH_MAX = 300;
/** Refresh interval in seconds within the allowed range; `fallback` for missing or invalid values. */
export const refreshSeconds = (v, fallback) => {
  const n = Number(v);
  return v === null || v === '' || !Number.isFinite(n) ? fallback : Math.min(REFRESH_MAX, Math.max(REFRESH_MIN, n));
};

/** Default configuration of a fresh installation (starts in demo mode). */
const defaults = () => ({
  version: 1,
  app: {
    name: 'Zuhause',
    motionPopup: true, // pop-up for normal motion
    motionPopupSeconds: 30,
    peoplePopup: true, // pop-up for advanced detection (people)
    peoplePopupSeconds: 60,
    popupRules: [], // schedule rules for the pop-ups, see popup-rules.js
    popupPosition: 'center', // 'center' (dialog in the middle) or 'corner' (small window bottom right)
    popupSize: 'large', // 'medium', 'large' or 'full' (almost the whole screen)
    snapshotRefreshSeconds: 3, // camera pictures inside the app (overview, camera page)
    popupSnapshotRefreshSeconds: 1, // camera picture of the motion pop-up (without live video or as fallback)
    popupLiveVideo: true, // motion pop-up shows the MJPEG live stream instead of refreshing pictures
  },
  iobroker: { mode: 'demo', host: '', port: 8081, secure: false, protocol: 'ws', user: '', password: '', verifySsl: false },
  homeassistant: { url: '', token: '', verifySsl: true },
  modules: sanitizeModules(),
  surveillance: {
    enabled: false,
    host: '',
    port: 5000,
    https: false,
    account: '',
    password: '',
    deviceId: '', // device token issued by DSM after a successful 2-factor login
    verifySsl: false,
    pollSeconds: 5,
    motionCooldownSeconds: 60,
    eventReasons: '2,3,9', // event "reason" codes that count as normal motion (2 motion, 3 alarm, 9 action rule)
    peopleReasons: '7', // reason codes that count as advanced detection / people (7 analytics)
  },
  // 3D printer: kind (`type`), OctoPrint connection (`apiKey` is a secret), overview display and webcam pop-ups, see octoprint.js
  octoprint: sanitizeOctoPrint(),
  // Bambu Lab printer (`octoprint.type: 'bambu'`): LAN connection (`accessCode` is a secret), camera, control, see bambu.js
  bambu: sanitizeBambu(),
  // Spotify Connect: client id of the own Spotify app; `refreshToken` (secret) and `account` come from the login, see spotify.js
  spotify: sanitizeSpotify(),
  webhookToken: crypto.randomBytes(16).toString('hex'),
  // the Raspberry Pi agents of wall displays report their sensors with this token, see kiosk.js
  kioskToken: crypto.randomBytes(16).toString('hex'),
  kiosk: sanitizeKiosk(), // settings sent to the kiosk agents (screen off, brightness, sensors)
  waste: sanitizeWaste(), // waste collection calendar (ICS) and its hints, see waste.js
  ventilation: sanitizeVentilation(), // ventilation advice, see ventilation.js
  // push notifications via Pushover (`user` and `token` are secrets), see pushover.js
  pushover: sanitizePushover(),
  rooms: [],
  devices: [],
  energy: { enabled: false, states: {}, gridInvert: false, batteryInvert: false },
  weather: {
    enabled: true,
    name: '', // display name of the location
    latitude: null, // null = location not set yet
    longitude: null,
    radar: true,
    windUnit: 'kmh', // unit of the local wind sensors: 'kmh' or 'ms'
    // local weather station (ioBroker datapoints), see WEATHER_STATE_KEYS
    states: {},
  },
  cameras: [],
  scenes: [],
  alerts: [], // user-defined notifications, see alerts.js
  layouts: sanitizeLayouts(), // grouping and order of the pages "Licht", "Klima" and "Räume", see layouts.js
  customDashboard: sanitizeDashboard(), // freely designable start page (widgets in a grid), see dashboard.js
});

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Deep merge for plain objects; arrays and primitives of `extra` replace those of `base`. */
function merge(base, extra) {
  const out = { ...base };
  for (const [k, v] of Object.entries(extra || {})) {
    out[k] = isObj(v) && isObj(base[k]) ? merge(base[k], v) : v;
  }
  return out;
}

/** Interprets typical truthy strings of environment variables. */
const bool = (v) => ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());

/** Reads a nested field by dotted path, e.g. getPath(cfg, 'iobroker.host'). */
const getPath = (obj, p) => p.split('.').reduce((o, k) => o?.[k], obj);
/** Writes a nested field by dotted path, creating missing intermediate objects. */
const setPath = (obj, p, v) => {
  const keys = p.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => (o[k] ??= {}), obj)[last] = v;
};

/** Environment variable -> configuration field, value type and whether it is a secret (never sent to the browser). */
const ENV_FIELDS = [
  ['IOBROKER_MODE', 'iobroker.mode', 'string'],
  ['IOBROKER_HOST', 'iobroker.host', 'string'],
  ['IOBROKER_PORT', 'iobroker.port', 'number'],
  ['IOBROKER_SECURE', 'iobroker.secure', 'bool'],
  ['IOBROKER_PROTOCOL', 'iobroker.protocol', 'string'],
  ['IOBROKER_USER', 'iobroker.user', 'string'],
  ['IOBROKER_PASSWORD', 'iobroker.password', 'string', true],
  ['IOBROKER_VERIFY_SSL', 'iobroker.verifySsl', 'bool'],
  ['HOMEASSISTANT_URL', 'homeassistant.url', 'string'],
  ['HOMEASSISTANT_TOKEN', 'homeassistant.token', 'string', true],
  ['HOMEASSISTANT_VERIFY_SSL', 'homeassistant.verifySsl', 'bool'],
  ['SS_HOST', 'surveillance.host', 'string'],
  ['SS_PORT', 'surveillance.port', 'number'],
  ['SS_HTTPS', 'surveillance.https', 'bool'],
  ['SS_ACCOUNT', 'surveillance.account', 'string'],
  ['SS_PASSWORD', 'surveillance.password', 'string', true],
  ['SS_DEVICE_ID', 'surveillance.deviceId', 'string', true],
  ['SS_VERIFY_SSL', 'surveillance.verifySsl', 'bool'],
];

/** Non-secret fields whose "set by hand" state is tracked (everything the environment can provide). */
const TRACKED = [...ENV_FIELDS.filter((f) => !f[3]).map((f) => f[1]), 'surveillance.enabled'];

/** docker-compose passes unset variables as empty strings, so empty counts as "not set". */
const isSet = (v) => v !== undefined && v !== null && String(v).trim() !== '';
const convert = (type, v) => (type === 'number' ? Number(v) : type === 'bool' ? bool(v) : String(v).trim());

/**
 * Every default the environment currently provides, by field path.
 * @returns {Map<string, {env: string, value: string|number|boolean, secret: boolean}>}
 */
export function envSources(e = process.env) {
  const m = new Map();
  for (const [env, p, type, secret] of ENV_FIELDS) if (isSet(e[env])) m.set(p, { env, value: convert(type, e[env]), secret: Boolean(secret) });
  // a host variable implies "use it": live mode / Surveillance Station on
  if (isSet(e.IOBROKER_HOST) && !m.has('iobroker.mode')) m.set('iobroker.mode', { env: 'IOBROKER_HOST', value: 'socketio', secret: false });
  if (isSet(e.SS_HOST)) m.set('surveillance.enabled', { env: 'SS_HOST', value: true, secret: false });
  if (isSet(e.DEMO_MODE)) m.set('iobroker.mode', { env: 'DEMO_MODE', value: bool(e.DEMO_MODE) ? 'demo' : 'socketio', secret: false });
  return m;
}

/**
 * Configuration with the environment defaults applied to every field that was not set by hand.
 * @param {object} raw stored configuration
 * @param {Set<string>} userSet fields set by hand
 */
export function applyEnv(raw, userSet, e = process.env) {
  const cfg = structuredClone(raw);
  for (const [p, s] of envSources(e)) {
    const manual = s.secret ? Boolean(getPath(raw, p)) : userSet.has(p);
    if (!manual) setPath(cfg, p, s.value);
  }
  return cfg;
}

/** Fingerprint of the environment variables that feed {@link applyEnv} (constant in production, tests change them). */
const envKey = (e = process.env) => [...ENV_FIELDS.map(([env]) => e[env] ?? ''), e.DEMO_MODE ?? ''].join('\u0000');

/** Effective configuration: stored values + environment defaults; in demo mode the sample installation. */
function buildEffective(raw, userSet) {
  const cfg = applyEnv(raw, userSet);
  cfg.modules = sanitizeModules(cfg.modules);
  if (cfg.iobroker.mode === 'demo') {
    const demo = demoContent();
    cfg.rooms = demo.rooms;
    cfg.devices = demo.devices;
    cfg.energy = demo.energy;
    cfg.scenes = demo.scenes;
    cfg.cameras = demo.cameras;
    cfg.weather = { ...cfg.weather, states: demo.weatherStates };
    // sample notifications, unless the user already defined own ones
    if (!cfg.alerts.length) cfg.alerts = demo.alerts;
  }
  if (!cfg.modules.weather) cfg.weather.enabled = false;
  if (!cfg.modules.mower) cfg.devices = cfg.devices.filter((device) => device.type !== 'mower');
  return cfg;
}

/**
 * Every state id a configuration refers to (devices, energy, weather, camera motion states, scene actions, alerts,
 * ventilation advice). Local kiosk datapoints (homeapp.kiosk.*) are included; they are not requested from ioBroker.
 */
function collectStateIds(cfg) {
  const ids = new Set();
  const add = (id) => id && ids.add(id);
  for (const d of cfg.devices) Object.values(d.states || {}).forEach(add);
  Object.values(cfg.energy?.states || {}).forEach(add);
  if (cfg.modules?.weather !== false) Object.values(cfg.weather?.states || {}).forEach(add);
  for (const c of cfg.cameras) {
    add(c.motionState);
    add(c.peopleState);
  }
  for (const s of cfg.scenes) for (const a of s.actions || []) add(a.state);
  for (const a of cfg.alerts || []) add(a.state);
  ventilationStateIds(cfg).forEach(add);
  return ids;
}

/** For config files from before the tracking existed: a stored value that differs from the default counts as set by hand. */
export function inferUserSet(raw) {
  const d = defaults();
  return new Set(TRACKED.filter((p) => String(getPath(raw, p)) !== String(getPath(d, p))));
}

/**
 * Replaces the secrets of a configuration (in place) by flags: `passwordSet` / `deviceIdSet` /
 * `apiKeySet` / `userSet` / `tokenSet` / `connected` tell the browser whether a value exists without revealing it.
 */
function maskSecrets(cfg) {
  cfg.surveillance.passwordSet = Boolean(cfg.surveillance.password);
  delete cfg.surveillance.password;
  cfg.surveillance.deviceIdSet = Boolean(cfg.surveillance.deviceId);
  delete cfg.surveillance.deviceId;
  cfg.iobroker.passwordSet = Boolean(cfg.iobroker.password);
  delete cfg.iobroker.password;
  cfg.homeassistant.tokenSet = Boolean(cfg.homeassistant.token);
  delete cfg.homeassistant.token;
  cfg.octoprint.apiKeySet = Boolean(cfg.octoprint.apiKey);
  delete cfg.octoprint.apiKey;
  cfg.bambu.accessCodeSet = Boolean(cfg.bambu.accessCode);
  delete cfg.bambu.accessCode;
  cfg.spotify.connected = Boolean(cfg.spotify.refreshToken);
  delete cfg.spotify.refreshToken;
  cfg.pushover.userSet = Boolean(cfg.pushover.user);
  delete cfg.pushover.user;
  cfg.pushover.tokenSet = Boolean(cfg.pushover.token);
  delete cfg.pushover.token;
  return cfg;
}

/** Persistent configuration with environment defaults; emits `change` after every {@link update}. */
export class ConfigStore extends EventEmitter {
  /** Cached effective configuration and its state ids (see {@link ConfigStore#effective}). */
  #cache = null;

  constructor() {
    super();
    fs.mkdirSync(DATA_DIR, { recursive: true });
    this.fileExisted = fs.existsSync(CONFIG_FILE);
    let loaded = {};
    if (this.fileExisted) {
      try {
        loaded = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      } catch (err) {
        console.error('config.json konnte nicht gelesen werden:', err.message);
        fs.copyFileSync(CONFIG_FILE, CONFIG_FILE + '.broken');
      }
    }
    const stored = Array.isArray(loaded.userSet) ? loaded.userSet : null;
    delete loaded.userSet;
    this.raw = merge(defaults(), loaded);
    this.raw.customDashboard = sanitizeDashboard(this.raw.customDashboard);
    this.raw.octoprint = sanitizeOctoPrint(this.raw.octoprint);
    this.raw.bambu = sanitizeBambu(this.raw.bambu);
    this.raw.spotify = sanitizeSpotify(this.raw.spotify);
    this.raw.kiosk = sanitizeKiosk(this.raw.kiosk);
    this.raw.waste = sanitizeWaste(this.raw.waste);
    this.raw.ventilation = sanitizeVentilation(this.raw.ventilation);
    this.raw.pushover = sanitizePushover(this.raw.pushover);
    this.raw.modules = sanitizeModules(this.raw.modules);
    // files from before the tracking: derive the manually set fields once and remember them
    this.userSet = stored ? new Set(stored) : this.fileExisted ? inferUserSet(this.raw) : new Set();
    // a newly generated token must be stored, otherwise it would change with every restart
    if (!this.fileExisted || !stored || !loaded.kioskToken) this.persist();
  }

  /** Writes the stored configuration atomically (temp file + rename) so a crash cannot corrupt it. */
  persist() {
    const tmp = CONFIG_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ ...this.raw, userSet: [...this.userSet].sort() }, null, 2));
    fs.renameSync(tmp, CONFIG_FILE);
  }

  /** Cache entry for the current stored configuration and environment (rebuilt when either changes). */
  #current() {
    const key = envKey();
    if (this.#cache?.key !== key) this.#cache = { key, cfg: buildEffective(this.raw, this.userSet), ids: null };
    return this.#cache;
  }

  /**
   * Effective config: file + environment defaults for fields not set by hand. In demo mode the sample
   * installation is shown. It is read on every state change, so it is cached – callers must not modify it.
   */
  get effective() {
    return this.#current().cfg;
  }

  /** True while no ioBroker is used and the sample installation is shown. */
  get isDemo() {
    return this.effective.iobroker.mode === 'demo';
  }

  /** Config as sent to the browser: secrets removed. */
  publicConfig() {
    const cfg = maskSecrets(structuredClone(this.effective));
    delete cfg.surveillance.deviceIdSet;
    delete cfg.webhookToken;
    delete cfg.kioskToken;
    return cfg;
  }

  /**
   * Config for the settings editor: the values the app actually uses (stored value, or the environment's
   * default for fields not set by hand), without the demo content and with secrets masked.
   */
  editableConfig() {
    return maskSecrets(applyEnv(this.raw, this.userSet));
  }

  /**
   * Which fields have an environment default and whether a manual value takes precedence.
   * Secret values are never reported, only that they are set.
   * @returns {{env: string, field: string, manual: boolean, value?: string|number|boolean, secret?: boolean}[]}
   */
  envInfo() {
    return [...envSources()].map(([field, s]) => ({
      env: s.env,
      field,
      manual: s.secret ? Boolean(getPath(this.raw, field)) : this.userSet.has(field),
      ...(s.secret ? { secret: true } : { value: s.value }),
    }));
  }

  /**
   * Replaces the stored configuration with the one from the settings editor.
   * Passwords the browser does not know are kept; the webhook and kiosk tokens can not be changed from outside.
   *
   * Precedence: the editor shows the effective values. A field whose value was changed there (compared
   * with what was shown) becomes "set by hand" and from then on beats the environment; fields that were
   * not touched keep following the environment. `next.resetEnv` lists fields to hand back to the
   * environment (they stop being "set by hand").
   *
   * Surveillance Station 2-factor login: `surveillance.otp` is a one-time code that is NOT stored,
   * only remembered in memory for the next connection attempt (see {@link takeOtp}). The device
   * token that DSM returns for it is stored via {@link setDeviceId}. It is dropped when the account
   * changes or when `surveillance.resetDeviceId` is set.
   */
  update(next) {
    if (!isObj(next)) throw new Error('Ungültige Konfiguration');
    const before = applyEnv(this.raw, this.userSet);
    const incoming = merge(defaults(), next);
    const reset = new Set(Array.isArray(next.resetEnv) ? next.resetEnv : []);
    const merged = structuredClone(incoming);
    delete merged.resetEnv;
    merged.version = 1;
    for (const p of TRACKED) {
      if (reset.has(p)) {
        this.userSet.delete(p);
        setPath(merged, p, getPath(this.raw, p));
      } else if (this.userSet.has(p)) {
        // already set by hand: take the incoming value
      } else if (String(getPath(incoming, p)) !== String(getPath(before, p))) {
        this.userSet.add(p);
      } else {
        setPath(merged, p, getPath(this.raw, p));
      }
    }
    // secrets the browser does not know (empty = unchanged) are kept
    if (!next.surveillance?.password) merged.surveillance.password = this.raw.surveillance.password;
    if (!next.iobroker?.password) merged.iobroker.password = this.raw.iobroker.password;
    if (!next.homeassistant?.token) merged.homeassistant.token = this.raw.homeassistant.token;
    delete merged.homeassistant.tokenSet;
    merged.octoprint = sanitizeOctoPrint(merged.octoprint);
    if (!next.octoprint?.apiKey) merged.octoprint.apiKey = this.raw.octoprint.apiKey;
    merged.bambu = sanitizeBambu(merged.bambu);
    if (!next.bambu?.accessCode) merged.bambu.accessCode = this.raw.bambu.accessCode;
    // the Spotify login is only written by the login itself; another client id makes it invalid
    merged.spotify = sanitizeSpotify(merged.spotify);
    const spotifyKept = merged.spotify.clientId === this.raw.spotify.clientId;
    merged.spotify.refreshToken = spotifyKept ? this.raw.spotify.refreshToken : '';
    merged.spotify.account = spotifyKept ? this.raw.spotify.account : '';
    const accountChanged = incoming.surveillance.account !== before.surveillance.account;
    merged.surveillance.deviceId = accountChanged || next.surveillance?.resetDeviceId ? '' : this.raw.surveillance.deviceId;
    this.pendingOtp = next.surveillance?.otp ? String(next.surveillance.otp) : null;
    for (const key of ['passwordSet', 'deviceIdSet', 'otp', 'resetDeviceId']) delete merged.surveillance[key];
    delete merged.iobroker.passwordSet;
    merged.webhookToken = this.raw.webhookToken;
    merged.kioskToken = this.raw.kioskToken;
    merged.kiosk = sanitizeKiosk(merged.kiosk);
    merged.waste = sanitizeWaste(merged.waste);
    merged.ventilation = sanitizeVentilation(merged.ventilation);
    merged.pushover = sanitizePushover(merged.pushover);
    merged.modules = sanitizeModules(merged.modules);
    if (!next.pushover?.user) merged.pushover.user = this.raw.pushover.user;
    if (!next.pushover?.token) merged.pushover.token = this.raw.pushover.token;
    merged.devices = (merged.devices || []).filter((d) => d && d.id && d.type);
    merged.app.popupRules = sanitizeRules(merged.app.popupRules);
    if (!POPUP_POSITIONS.includes(merged.app.popupPosition)) merged.app.popupPosition = 'center';
    if (!POPUP_SIZES.includes(merged.app.popupSize)) merged.app.popupSize = 'large';
    merged.app.snapshotRefreshSeconds = refreshSeconds(merged.app.snapshotRefreshSeconds, 3);
    merged.app.popupSnapshotRefreshSeconds = refreshSeconds(merged.app.popupSnapshotRefreshSeconds, 1);
    merged.app.popupLiveVideo = merged.app.popupLiveVideo !== false;
    merged.weather = sanitizeWeather(merged.weather);
    merged.alerts = sanitizeAlerts(merged.alerts);
    merged.layouts = sanitizeLayouts(merged.layouts);
    // the start page has its own endpoint (see setDashboard); an open settings page must not overwrite it
    merged.customDashboard = this.raw.customDashboard;
    this.raw = merged;
    this.#cache = null;
    this.persist();
    this.emit('change');
  }

  /**
   * Saves the freely designable start page. Unlike {@link update} this does not restart the
   * integrations; it emits `dashboard` with the cleaned start page instead.
   */
  setDashboard(next) {
    this.raw.customDashboard = sanitizeDashboard(next);
    this.#cache = null;
    this.persist();
    this.emit('dashboard', this.raw.customDashboard);
    return this.raw.customDashboard;
  }

  /** Returns the pending one-time 2-factor code (once) and forgets it. */
  takeOtp() {
    const otp = this.pendingOtp ?? null;
    this.pendingOtp = null;
    return otp;
  }

  /** Stores the device token issued by DSM; does not trigger a reconnect. */
  setDeviceId(id) {
    this.raw.surveillance.deviceId = id;
    this.#cache = null;
    this.persist();
  }

  /**
   * Stores the Spotify login (refresh token and account name; `null` keeps a value, '' removes it).
   * Like {@link setDeviceId} it does not restart the integrations.
   */
  setSpotifyAuth({ refreshToken = null, account = null } = {}) {
    if (refreshToken !== null) this.raw.spotify.refreshToken = String(refreshToken);
    if (account !== null) this.raw.spotify.account = String(account).slice(0, 100);
    this.#cache = null;
    this.persist();
  }

  /** All state ids the app needs (devices, energy, weather, camera motion states, scene actions, alerts, ventilation); cached, do not modify. */
  stateIds() {
    const c = this.#current();
    return (c.ids ??= collectStateIds(c.cfg));
  }
}
