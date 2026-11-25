/**
 * ioBroker connection.
 *
 * Two wire protocols are supported:
 *   - "ws"        pure WebSocket of ioBroker admin (v6+) and the ws adapter, via `@iobroker/ws`
 *   - "socketio"  classic socket.io of the web / socketio adapters
 *
 * Authentication: if a user is configured, an OAuth2 access token is requested
 * (`POST /oauth/token`, password grant) and passed to the socket. Tokens live for
 * one hour, so the connection is renewed with a fresh token after 50 minutes.
 *
 * The user needs read (and for control: write) permission on the states – in the
 * ioBroker admin the user must be a member of a group such as "user".
 *
 * Interface shared with the demo source: `states` (Map), `start/stop`, `setIds`,
 * `set`, `search`, `read`, `status` and the events `state`, `connection`, `objects`.
 */
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import http from 'node:http';
import https from 'node:https';
import WebSocket from 'ws';
import { io as socketIo } from 'socket.io-client';
import { analyseWrite, userIdOf } from './permissions.js';
import { searchObjects } from './util.js';

const require = createRequire(import.meta.url);
require('@iobroker/ws'); // registers globalThis.io.connect (plain websocket protocol of ioBroker admin / ws adapter)

/** Display name of an ioBroker object: `common.name` may be a string or a translation object. */
const nameOf = (n) => (n && typeof n === 'object' ? n.de || n.en || Object.values(n)[0] : n) || '';
const TOKEN_REFRESH_MS = 50 * 60 * 1000;
const RETRY_MS = 10000;
const PERMISSION_HINT =
  'Keine Berechtigung: Der ioBroker-Benutzer ist keiner Gruppe mit Lese-/Schreibrechten zugeordnet (Admin → Benutzer/Gruppen → Gruppe "user" oder "administrator").';
const WRITE_DENIED =
  'Keine Schreibberechtigung für diesen Datenpunkt. Vermutlich gehört er einer anderen Gruppe (Objektrechte): siehe Einstellungen → Verbindung → „Schreibrechte prüfen“.';
/** Error codes / messages that mean "host not reachable" (as opposed to a rejected login). */
const NETWORK_ERROR = /ECONN|EHOST|ENOTFOUND|ETIMEDOUT|Zeit|EAI_AGAIN/;

/** Parses ioBroker value types so a UI value always matches the target object. */
export function coerce(value, type) {
  if (type === 'boolean') return value === true || value === 1 || value === '1' || value === 'true';
  if (type === 'number') {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }
  if (type === 'string') return String(value);
  return value;
}

/** Minimal HTTP(S) form POST (used for the OAuth2 token request). Resolves with status code and body text. */
function postForm(urlString, form, verifySsl) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const body = new URLSearchParams(form).toString();
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(
      url,
      {
        method: 'POST',
        rejectUnauthorized: verifySsl,
        timeout: 8000,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        let text = '';
        res.on('data', (c) => (text += c));
        res.on('end', () => resolve({ status: res.statusCode, text }));
      },
    );
    req.on('timeout', () => req.destroy(new Error('Zeitüberschreitung')));
    req.on('error', reject);
    req.end(body);
  });
}

/** Connection to ioBroker (ws / socketio adapter or admin) incl. OAuth2 login. */
export class IoBrokerSource extends EventEmitter {
  constructor() {
    super();
    this.kind = 'iobroker';
    /** state id -> { val, ts, ack } of all subscribed states */
    this.states = new Map();
    /** state id -> object info (name, type, role, unit, ...) of the whole installation, for search and discovery */
    this.objects = new Map();
    /** state ids the app needs (from the configuration) */
    this.wanted = new Set();
    /** state ids subscribed on the current connection */
    this.subscribed = new Set();
    this.connected = false;
    this.error = null;
    this.permissionDenied = false;
    this.client = null;
    // Every (re)connect increments the generation. Callbacks of older connections compare their
    // generation with the current one and ignore themselves, so a stale socket cannot change the status.
    this.generation = 0;
    this.timers = new Set();
  }

  /** setTimeout that is cancelled automatically by {@link stop}. */
  later(fn, ms) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  /** Connects with the given configuration (`host`, `port`, `secure`, `protocol`, `user`, `password`, `verifySsl`). */
  start(cfg) {
    this.stop();
    this.cfg = cfg;
    if (!cfg.host) {
      this.error = 'Kein ioBroker-Host konfiguriert';
      this.emit('connection');
      return;
    }
    this.open(++this.generation);
  }

  /** Disconnects, cancels all timers and forgets the states (objects are kept for the search). */
  stop() {
    this.generation++;
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    this.closeClient();
    this.connected = false;
    this.permissionDenied = false;
    this.states.clear();
    this.subscribed.clear();
  }

  /** Closes the current socket without emitting events (works for both client libraries). */
  closeClient() {
    const c = this.client;
    this.client = null;
    if (!c) return;
    try {
      if (c.destroy) c.destroy();
      else {
        c.removeAllListeners?.();
        c.disconnect?.();
      }
    } catch {
      /* already closed */
    }
  }

  get baseUrl() {
    return `${this.cfg.secure ? 'https' : 'http'}://${this.cfg.host}:${this.cfg.port || 8084}`;
  }

  /**
   * Requests an OAuth2 access token.
   * @returns {Promise<string|null>} the token, or null if no user is configured / the adapter has no authentication
   */
  async login() {
    if (!this.cfg.user) return null;
    const res = await postForm(
      `${this.baseUrl}/oauth/token`,
      { grant_type: 'password', username: this.cfg.user, password: this.cfg.password || '', client_id: 'ioBroker', stay_logged_in: 'false' },
      Boolean(this.cfg.verifySsl),
    );
    if (res.status === 200) return JSON.parse(res.text).access_token;
    if (res.status === 404) return null; // adapter without authentication
    throw new Error(res.status === 401 || res.status === 400 ? 'Anmeldung am ioBroker fehlgeschlagen (Benutzer oder Passwort falsch)' : `Anmeldung fehlgeschlagen (HTTP ${res.status})`);
  }

  /** Creates the socket for the configured wire protocol (not yet wired to any event). */
  createClient(token) {
    const verify = Boolean(this.cfg.verifySsl);
    if (this.cfg.protocol !== 'socketio') {
      // @iobroker/ws creates the WebSocket itself; this subclass passes the TLS option through
      class TlsWebSocket extends WebSocket {
        constructor(url) {
          super(url, { rejectUnauthorized: verify });
        }
      }
      return globalThis.io.connect(this.baseUrl, { token: token || undefined, name: 'HomeApp', WebSocket: TlsWebSocket, callbackTimeout: 15000 });
    }
    return socketIo(this.baseUrl, {
      path: '/socket.io',
      transports: ['websocket'],
      reconnectionDelay: 2000,
      reconnectionDelayMax: 15000,
      timeout: 8000,
      query: { name: 'HomeApp', ...(token ? { token } : {}) },
      extraHeaders: token ? { Cookie: `access_token=${token}` } : undefined,
      rejectUnauthorized: verify,
    });
  }

  /**
   * Logs in (if needed), opens the socket and wires its events. `gen` is the generation this
   * attempt belongs to; everything is ignored as soon as a newer attempt (or stop) happened.
   */
  async open(gen) {
    const current = () => gen === this.generation;
    /** Schedules a complete reconnect (new token, new socket). */
    const reopen = (ms) => current() && this.later(() => current() && this.open(++this.generation), ms);
    let token = null;
    try {
      token = await this.login();
    } catch (err) {
      if (!current()) return;
      this.connected = false;
      this.error = NETWORK_ERROR.test(`${err.code} ${err.message}`) ? `ioBroker nicht erreichbar: ${err.message || err.code}` : err.message;
      this.emit('connection');
      return reopen(RETRY_MS);
    }
    if (!current()) return;
    this.closeClient();
    const client = this.createClient(token);
    this.client = client;
    client.on('connect', () => {
      if (!current()) return;
      this.connected = true;
      this.error = null;
      this.subscribed.clear();
      this.emit('connection');
      this.loadObjects();
      this.sync();
    });
    client.on('disconnect', () => {
      if (!current()) return;
      this.connected = false;
      this.error = 'Verbindung zum ioBroker getrennt – verbinde neu …';
      this.emit('connection');
    });
    const onError = (err) => {
      if (!current()) return;
      this.connected = false;
      this.error = `ioBroker nicht erreichbar: ${err?.message || err}`;
      this.emit('connection');
    };
    client.on('error', onError);
    client.on('connect_error', onError);
    client.on('stateChange', (id, state) => {
      if (this.wanted.has(id)) this.applyState(id, state);
    });
    // tokens are valid for one hour: reconnect with a fresh one before it expires
    if (token) reopen(TOKEN_REFRESH_MS);
  }

  /** Stores a state received from ioBroker and emits `state`. */
  applyState(id, state) {
    if (!state) return;
    const entry = { val: state.val, ts: state.ts || Date.now(), ack: Boolean(state.ack) };
    this.states.set(id, entry);
    this.emit('state', id, entry);
  }

  /** Sets the state ids the app needs and (un)subscribes accordingly. */
  setIds(ids) {
    this.wanted = new Set(ids);
    this.sync();
  }

  /** Handles a `permissionError` answer: reports it once as connection error. Returns true if `err` was one. */
  denied(err) {
    if (err !== 'permissionError') return false;
    if (!this.permissionDenied) {
      this.permissionDenied = true;
      this.error = PERMISSION_HINT;
      this.emit('connection');
    }
    return true;
  }

  /** Brings the subscriptions in line with `wanted`: subscribes + reads new ids, unsubscribes obsolete ones. */
  sync() {
    if (!this.connected || !this.client) return;
    for (const id of this.wanted) {
      if (this.subscribed.has(id)) continue;
      this.subscribed.add(id);
      this.client.emit('subscribe', id, (err) => this.denied(err));
      this.client.emit('getState', id, (err, state) => {
        if (!err && state) this.applyState(id, state);
        else this.denied(err);
      });
    }
    for (const id of [...this.subscribed]) {
      if (!this.wanted.has(id)) {
        this.client.emit('unsubscribe', id, () => {});
        this.subscribed.delete(id);
        this.states.delete(id);
      }
    }
  }

  /** Loads all state objects of the installation (for the datapoint search and the discovery). */
  loadObjects() {
    this.client.emit('getObjectView', 'system', 'state', { startkey: '', endkey: '\u9999' }, (err, res) => {
      if (this.denied(err) || err || !res?.rows) return;
      this.permissionDenied = false;
      this.objects.clear();
      for (const row of res.rows) {
        const c = row.value?.common || {};
        this.objects.set(row.id, {
          id: row.id,
          name: nameOf(c.name),
          type: c.type,
          role: c.role,
          unit: c.unit,
          write: c.write !== false,
          min: c.min,
          max: c.max,
          states: c.states && typeof c.states === 'object' && !Array.isArray(c.states) ? c.states : undefined,
        });
      }
      this.emit('objects');
      this.emit('connection');
    });
  }

  /** Reads the current value of any state (used by the discovery for names). */
  read(id) {
    return new Promise((resolve) => {
      if (!this.connected) return resolve(undefined);
      const timer = setTimeout(() => resolve(undefined), 5000);
      this.client.emit('getState', id, (err, state) => {
        clearTimeout(timer);
        resolve(err ? undefined : state?.val);
      });
    });
  }

  /** Datapoint search over id and name (all terms must match). */
  search(q, limit = 30) {
    return searchObjects(this.objects.values(), q, limit);
  }

  /** Writes a command (`ack: false`) to a state; the value is converted to the object's type first. */
  set(id, value) {
    if (!this.connected) return Promise.reject(new Error('ioBroker nicht verbunden'));
    const val = coerce(value, this.objects.get(id)?.type);
    return new Promise((resolve, reject) => {
      this.client.emit('setState', id, { val, ack: false }, (err) => {
        if (err === 'permissionError') reject(new Error(WRITE_DENIED));
        else if (err) reject(new Error(String(err)));
        else resolve();
      });
    });
  }

  /** Promise wrapper for a socket request whose answer is `(err, result)`. */
  request(name, ...args) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ err: 'timeout' }), 10000);
      this.client.emit(name, ...args, (err, result) => {
        clearTimeout(timer);
        resolve({ err, result });
      });
    });
  }

  /**
   * Finds out for each id whether the logged-in user may write it (group rights + object ACL).
   * Reads only: the groups of the user and the `acl` of the objects.
   * @returns {{userId: string, groups: string[], groupsAllowWrite: boolean, items: object[]}}
   */
  async checkWriteAccess(ids) {
    if (!this.connected) throw new Error('ioBroker nicht verbunden');
    const userId = userIdOf(this.cfg.user);
    const view = await this.request('getObjectView', 'system', 'group', { startkey: 'system.group.', endkey: 'system.group.\u9999' });
    const rows = view.result?.rows || [];
    // the view's `id` is the display name ("Administrator"); the real id is in value._id
    const mine = rows.filter((r) => (r.value?.common?.members || []).includes(userId));
    const groups = mine.map((r) => r.value?._id || r.id);
    const groupsAllowWrite = mine.some((r) => r.value?.common?.acl?.state?.write);
    const items = [];
    for (let i = 0; i < ids.length; i += 20) {
      const batch = await Promise.all(
        ids.slice(i, i + 20).map(async (id) => {
          const { result } = await this.request('getObject', id);
          const acl = result?.acl;
          return { id, found: Boolean(result), owner: acl?.owner, ownerGroup: acl?.ownerGroup, state: acl?.state, ...analyseWrite(acl, userId, groups, groupsAllowWrite) };
        }),
      );
      items.push(...batch);
    }
    return { userId, groups, groupsAllowWrite, items };
  }

  /** Connection info for the status display of the browser. */
  status() {
    return { connected: this.connected, error: this.error, objects: this.objects.size, permissionDenied: this.permissionDenied };
  }
}
