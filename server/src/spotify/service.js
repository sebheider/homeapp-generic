/**
 * The Spotify service: runs the player source (Web API or demo), polls the playback state, executes
 * commands and handles the login.
 */
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { trimText } from '../util/text.js';
import { ACCOUNTS, API, SpotifyError, spotifyFetch, spotifyMessage } from './api.js';
import { optimistic, sanitizeCommand } from './commands.js';
import { sanitizeSpotify } from './config.js';
import { DemoSpotifySource } from './demo.js';
import { authorizeUrl, pkcePair, redirectUriFor } from './login.js';
import { findDevice, normalizePlayback } from './normalize.js';
import { SpotifyWebSource } from './web-source.js';

const LOGIN_TTL_MS = 10 * 60000;
const IDLE_POLL_MS = 10000;
const ERROR_RETRY_MS = 15000;

/**
 * Polls the playback state and executes commands. Events:
 *   - `data`    playback state for the browsers (only when something changed)
 *   - `status`  connection changed (for the status payload)
 *   - `token`   Spotify issued a new refresh token (to be stored)
 */
export class SpotifyService extends EventEmitter {
  /** @param {{fetchImpl?: typeof fetch, retryDelay?: number}} opts injectable for tests */
  constructor({ fetchImpl, retryDelay } = {}) {
    super();
    this.fetchImpl = fetchImpl ?? ((...a) => fetch(...a));
    this.retryDelay = retryDelay;
    this.request = (url, init) => spotifyFetch(this.fetchImpl, url, init, { retryDelay });
    this.cfg = sanitizeSpotify();
    this.source = null;
    this.demo = false;
    this.key = null;
    this.timer = null;
    this.generation = 0;
    this.pollSeq = 0;
    this.readAt = 0; // time of the last successful read (base of `current()`)
    this.logins = new Map(); // state -> { verifier, redirectUri, clientId, ts }
    this.data = this.baseData();
  }

  keyOf(cfg, demo) {
    const real = Boolean(cfg.enabled && cfg.clientId && cfg.refreshToken);
    return JSON.stringify([cfg.enabled, cfg.clientId, cfg.refreshToken, !real && demo]);
  }

  /**
   * Applies the configuration; a new connection is only made when the account changes, so saving
   * other settings does not interrupt anything.
   * @param {object} cfg `spotify` section of the configuration
   * @param {{demo?: boolean}} opts demo mode: a simulated player unless an account is connected
   */
  configure(cfg, { demo = false } = {}) {
    const next = sanitizeSpotify(cfg);
    const key = this.keyOf(next, demo);
    this.cfg = next;
    if (key === this.key) {
      this.update({ account: this.accountName() });
      return false;
    }
    const real = Boolean(next.enabled && next.clientId && next.refreshToken);
    this.stop();
    const gen = this.generation;
    this.key = key;
    this.demo = !real && demo;
    this.source = real
      ? new SpotifyWebSource(next, {
          fetchImpl: this.fetchImpl,
          retryDelay: this.retryDelay,
          onRefreshToken: (token) => {
            // a renewal that finishes after a logout / another login must not bring the old account back
            if (gen !== this.generation) return;
            this.cfg.refreshToken = token;
            this.key = this.keyOf(this.cfg, demo);
            this.emit('token', token);
          },
        })
      : this.demo
        ? new DemoSpotifySource()
        : null;
    this.authFailed = false;
    this.readAt = 0;
    this.data = this.baseData();
    this.emit('data', this.data);
    this.emit('status');
    if (this.source) this.schedule(0);
    return true;
  }

  stop() {
    clearTimeout(this.timer);
    this.timer = null;
    this.generation++;
    this.source?.close();
    this.source = null;
  }

  accountName() {
    return this.cfg.account || (this.demo ? 'Demo' : null);
  }

  /** Spotify is switched on (or the demo player runs) – the page belongs to the navigation. */
  get enabled() {
    return Boolean(this.source) || this.cfg.enabled;
  }

  baseData() {
    return {
      enabled: this.enabled,
      demo: this.demo,
      connected: false,
      error: this.cfg.enabled && !this.source ? 'Noch nicht mit Spotify verbunden – Einstellungen → Spotify.' : null,
      account: this.accountName(),
      ...normalizePlayback(null),
      lastPlayingAt: 0,
      updatedAt: Date.now(),
    };
  }

  status() {
    return { enabled: this.enabled, connected: this.data.connected, error: this.data.error, demo: this.demo, account: this.data.account };
  }

  /**
   * State with the position advanced to `now`: the last read is up to one poll interval old, and the
   * browsers count on from the moment a message arrives (bootstrap, GET /api/spotify, commands).
   */
  current(now = Date.now()) {
    const d = this.data;
    if (!d.playing || !this.readAt) return d;
    return { ...d, progress: Math.round(Math.min(d.progress + Math.max(0, now - this.readAt), d.track?.duration || Infinity)) };
  }

  /** Merges `patch` into the state and emits `data` (and `status`) if something changed. */
  update(patch) {
    const prev = this.data;
    const next = { ...prev, ...patch, updatedAt: prev.updatedAt };
    if (JSON.stringify(next) === JSON.stringify(prev)) return;
    next.updatedAt = Date.now();
    this.data = next;
    this.emit('data', next);
    if (prev.connected !== next.connected || prev.error !== next.error || prev.account !== next.account) this.emit('status');
  }

  /** Next poll in `ms` (replaces a planned one). */
  schedule(ms) {
    clearTimeout(this.timer);
    const gen = this.generation;
    this.timer = setTimeout(async () => {
      const wait = await this.poll();
      if (gen === this.generation && this.source && wait != null) this.schedule(wait);
    }, ms);
    this.timer.unref?.();
  }

  /** Reads the playback state once; returns the delay until the next poll (null: stop polling). */
  async poll(now = Date.now()) {
    const src = this.source;
    if (!src || this.authFailed) return null;
    const gen = this.generation;
    const seq = ++this.pollSeq;
    const every = this.cfg.pollSeconds * 1000;
    try {
      const state = await src.read(now);
      // an outdated read (configuration changed, a command or a newer poll since) neither applies nor reschedules
      if (gen !== this.generation || seq !== this.pollSeq) return null;
      this.readAt = now;
      this.update({ ...state, connected: true, error: null, account: this.accountName(), lastPlayingAt: state.playing ? now : this.data.lastPlayingAt });
      return state.playing ? every : state.active ? every * 2 : Math.max(every, IDLE_POLL_MS);
    } catch (err) {
      if (gen !== this.generation || seq !== this.pollSeq) return null;
      if (err.fatal) this.authFailed = true; // retried only after a new login
      this.update({ connected: false, error: err.message || 'Spotify nicht erreichbar.', playing: false });
      if (err.fatal) return null;
      return err.retryAfter ? err.retryAfter * 1000 : ERROR_RETRY_MS;
    }
  }

  require() {
    if (!this.source) throw new SpotifyError(409, this.cfg.enabled ? 'Noch nicht mit Spotify verbunden.' : 'Spotify ist nicht eingerichtet.');
    return this.source;
  }

  /**
   * Device for starting playback while nothing is active: the chosen device (amplifier), otherwise
   * the active or first available one.
   */
  async targetDevice() {
    const devices = await this.require().devices();
    const usable = devices.filter((d) => !d.restricted);
    const dev = findDevice(usable, this.cfg.device) ?? usable.find((d) => d.active) ?? usable[0];
    if (!dev) throw new SpotifyError(404, 'Kein Spotify-Gerät verfügbar – schalte den Verstärker ein oder öffne Spotify einmal auf einem Gerät.');
    return dev.id;
  }

  /** Executes a command from the browser, shows its effect right away and reads the real state shortly after. */
  async command(action, params = {}) {
    const src = this.require();
    const c = sanitizeCommand(action, params);
    if (c.action === 'play' && !c.deviceId && !this.data.active) {
      const deviceId = await this.targetDevice();
      // resuming on an idle device: hand playback over to it
      if (!c.uris && !c.contextUri) Object.assign(c, { action: 'transfer', deviceId, play: true });
      else c.deviceId = deviceId;
    }
    await src.command(c);
    this.pollSeq++; // a read that started before the command is outdated
    // the pushed state carries the position of this moment (unless the command sets it itself)
    const now = Date.now();
    const progress = this.current(now).progress;
    this.readAt = now;
    this.update({ progress, ...optimistic(c, this.data, now) });
    this.schedule(c.action === 'volume' ? 1500 : 600);
  }

  search(q) {
    const query = trimText(q, 200);
    return query ? this.require().search(query) : Promise.resolve({ tracks: [], albums: [], artists: [], playlists: [] });
  }

  playlists() {
    return this.require().playlists();
  }

  devices() {
    return this.require().devices();
  }

  queue() {
    return this.require().queue();
  }

  recent() {
    return this.require().recent();
  }

  /** Starts a login: remembers verifier and redirect URI, returns the address of Spotify's consent page. */
  startLogin(clientId, origin, now = Date.now()) {
    for (const [k, v] of this.logins) if (now - v.ts > LOGIN_TTL_MS) this.logins.delete(k);
    const id = trimText(clientId, 100);
    if (!id) throw new SpotifyError(400, 'Zuerst die Client-ID eintragen und speichern.');
    const redirectUri = redirectUriFor(origin);
    if (!redirectUri) throw new SpotifyError(400, 'Ungültige Adresse der App.');
    const state = crypto.randomBytes(16).toString('hex');
    const { verifier, challenge } = pkcePair();
    this.logins.set(state, { verifier, redirectUri, clientId: id, ts: now });
    return authorizeUrl({ clientId: id, redirectUri, state, challenge });
  }

  /** Completes a login (callback of Spotify): exchanges the code, returns refresh token, account name and client id. */
  async finishLogin({ code, state, error }, now = Date.now()) {
    const login = this.logins.get(String(state || ''));
    this.logins.delete(String(state || ''));
    if (!login || now - login.ts > LOGIN_TTL_MS) throw new SpotifyError(400, 'Anmeldung abgelaufen – bitte erneut verbinden.');
    if (error) throw new SpotifyError(403, error === 'access_denied' ? 'Zugriff in Spotify abgelehnt.' : `Spotify meldet: ${trimText(error, 100)}`);
    const res = await this.request(`${ACCOUNTS}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: String(code || ''), redirect_uri: login.redirectUri, client_id: login.clientId, code_verifier: login.verifier }).toString(),
    });
    const tokens = await res.json().catch(() => ({}));
    if (!res.ok || !tokens.refresh_token) {
      const hint = tokens.error === 'invalid_grant' && /redirect/i.test(tokens.error_description || '') ? ' Stimmt die Redirect-URI im Developer-Dashboard?' : '';
      throw new SpotifyError(400, `Anmeldung fehlgeschlagen (${tokens.error_description || tokens.error || res.status}).${hint}`);
    }
    let account = '';
    try {
      const me = await this.request(`${API}/me`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      const profile = await me.json().catch(() => ({}));
      if (me.status === 403) throw new SpotifyError(403, spotifyMessage(403, null, profile?.error?.message ?? String(profile?.error ?? '')));
      account = trimText(profile.display_name || profile.id, 100);
    } catch (err) {
      // only a refused account stops the login; without the name (e.g. no answer) it is just not shown
      if (err instanceof SpotifyError && err.status === 403) throw err;
      /* the name is only shown in the settings */
    }
    return { refreshToken: tokens.refresh_token, account, clientId: login.clientId };
  }
}
