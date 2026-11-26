/**
 * The configuration store: loads and persists config.json and applies the changes of the settings page.
 */
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { sanitizeAlerts } from '../alerts.js';
import { sanitizeBambu } from '../bambu.js';
import { sanitizeDashboard } from '../dashboard.js';
import { sanitizeKiosk } from '../kiosk.js';
import { sanitizeLayouts } from '../layouts.js';
import { sanitizeModules } from '../modules.js';
import { sanitizeOctoPrint } from '../octoprint.js';
import { sanitizeRules } from '../popup-rules.js';
import { sanitizePushover } from '../pushover.js';
import { sanitizeSpotify } from '../spotify.js';
import { sanitizeVentilation } from '../ventilation.js';
import { sanitizeWaste } from '../waste.js';
import { sanitizeWeather } from '../weather.js';
import { writeFileAtomic } from '../util/fs.js';
import { getPath, isObj, merge, setPath } from '../util/object.js';
import { POPUP_POSITIONS, POPUP_SIZES, defaults, refreshSeconds } from './defaults.js';
import { buildEffective, collectStateIds, maskSecrets } from './effective.js';
import { TRACKED, applyEnv, envKey, envSources, inferUserSet } from './env.js';
import { CONFIG_FILE, DATA_DIR } from './paths.js';

/** How often a busy config.json is renamed again before saving fails (see writeFileAtomic). */
const PERSIST_RETRIES = 6;

/** Persistent configuration with environment defaults; emits `change` after every {@link update}. */
export class ConfigStore extends EventEmitter {
  /** Cached effective configuration and its state ids (see {@link ConfigStore#effective}). */
  #cache = null;
  /** Installed external modules (see {@link setExtensions}); null until the registry is attached. */
  #extensions = null;

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
    if (!isObj(this.raw.extensions)) this.raw.extensions = {};
    // files from before the tracking: derive the manually set fields once and remember them
    this.userSet = stored ? new Set(stored) : this.fileExisted ? inferUserSet(this.raw) : new Set();
    // a newly generated token must be stored, otherwise it would change with every restart
    if (!this.fileExisted || !stored || !loaded.kioskToken) this.persist();
  }

  /**
   * Writes the stored configuration atomically (temp file + rename) so a crash cannot corrupt it. A rename
   * that fails because the file is busy for a moment (virus scanner or indexer on Windows) is retried.
   */
  persist() {
    writeFileAtomic(CONFIG_FILE, JSON.stringify({ ...this.raw, userSet: [...this.userSet].sort() }, null, 2), { retries: PERSIST_RETRIES });
  }

  /** Cache entry for the current stored configuration and environment (rebuilt when either changes). */
  #current() {
    const key = envKey();
    if (this.#cache?.key !== key) this.#cache = { key, cfg: buildEffective(this.raw, this.userSet, this.#extensions), ids: null };
    return this.#cache;
  }

  /**
   * Attaches the registry of the installed external modules (extensions.js). From then on their stored
   * settings are cleaned against the manifests and the datapoints of enabled modules count as known.
   */
  setExtensions(registry) {
    this.#extensions = registry;
    this.raw.extensions = registry.sanitizeConfig(this.raw.extensions, this.raw.extensions);
    this.#cache = null;
  }

  /** A module was installed, updated or removed: clean its stored state and restart the integrations. */
  extensionsChanged() {
    if (this.#extensions) this.raw.extensions = this.#extensions.sanitizeConfig(this.raw.extensions, this.raw.extensions);
    this.#cache = null;
    this.persist();
    this.emit('change');
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
    const cfg = applyEnv(this.raw, this.userSet);
    // every installed module appears with its defaults, so the editor can switch it on
    if (this.#extensions) cfg.extensions = this.#extensions.sanitizeConfig(cfg.extensions);
    return maskSecrets(cfg);
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
    merged.extensions = this.#extensions ? this.#extensions.sanitizeConfig(merged.extensions, this.raw.extensions) : this.raw.extensions;
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

  /** All state ids the app needs (devices, energy, weather, camera motion states, scene actions, alerts, ventilation, external modules); cached, do not modify. */
  stateIds() {
    const c = this.#current();
    return (c.ids ??= collectStateIds(c.cfg, this.#extensions));
  }
}
