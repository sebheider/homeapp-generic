/**
 * Synology Surveillance Station client.
 *
 * Uses the official Web API (verified against the "Surveillance Station Web API"
 * developer guide):
 *   - SYNO.API.Info              discovers API paths and versions
 *   - SYNO.API.Auth              login (format=sid) with automatic re-login on session errors
 *   - SYNO.SurveillanceStation.Camera
 *       List                     camera list
 *       GetSnapshot              JPEG snapshot (version 9: parameter `id`, older: `cameraId`)
 *       GetLiveViewPath          URL of the MJPEG stream (contains a stream key)
 *   - SYNO.SurveillanceStation.VideoStreaming  Stream (format=mjpeg) – fallback for the live view
 *   - SYNO.SurveillanceStation.Recording       List – new motion recordings are used as motion events
 *
 * Snapshots are cached for ~1 s and shared by all viewers to keep the load on the NAS small.
 */
import http from 'node:http';
import https from 'node:https';
import { EventEmitter } from 'node:events';

/** API error codes that mean "session expired / invalid": log in again and repeat the request once. */
const SESSION_ERRORS = new Set([105, 106, 107, 119]);
const MAX_STREAMS = 8;
const SNAPSHOT_CACHE_MS = 1200;
const CAMERA_REFRESH_MS = 60000;

/**
 * Error codes of SYNO.API.Auth with a user-facing explanation. All of them are credential or policy
 * problems that do not fix themselves, so the client stops retrying (DSM would block the IP otherwise).
 */
const AUTH_ERRORS = {
  400: 'Benutzername oder Passwort falsch',
  401: 'Konto deaktiviert',
  402: 'Zugriff verweigert (keine Berechtigung)',
  403: 'Das Konto benötigt einen 2-Faktor-Code: In den Einstellungen den aktuellen Code aus der Authenticator-App eintragen und speichern (nur einmalig nötig)',
  404: '2-Faktor-Code falsch oder abgelaufen – bitte den aktuellen Code erneut eintragen und speichern',
  405: 'Anmeldung von dieser IP-Adresse nicht erlaubt',
  406: 'DSM verlangt für dieses Konto die 2-Faktor-Anmeldung, sie ist aber noch nicht eingerichtet: In DSM unter Persönlich → Konto → 2-Faktor-Authentifizierung einrichten (oder die Pflicht für das Konto aufheben)',
  407: 'Die IP-Adresse der App wurde von DSM gesperrt (Systemsteuerung → Sicherheit → Schutz)',
  408: 'Passwort abgelaufen – in DSM neu setzen',
  409: 'Passwort abgelaufen – in DSM neu setzen',
  410: 'Das Passwort muss in DSM zuerst geändert werden',
};

/** "2, 3,9" -> Set {'2', '3', '9'} (reason code lists of the configuration). */
const parseCodes = (s) => new Set(String(s || '').split(',').map((x) => x.trim()).filter(Boolean));

/** Client for the Synology Surveillance Station Web API (cameras, snapshots, MJPEG, motion events). */
export class SurveillanceClient extends EventEmitter {
  constructor() {
    super();
    this.cfg = null;
    this.sid = null; // session id of the current login
    this.apis = null; // result of SYNO.API.Info (paths and versions)
    this.cameras = [];
    this.connected = false;
    this.error = null;
    this.seen = new Set(); // ids of events that were already processed
    this.reasonStats = {}; // reason code -> { count, last }, shown in the settings
    this.primed = false; // false until the first event poll (which only records existing events)
    this.snapshots = new Map(); // camera id -> { ts, promise } (short-lived snapshot cache)
    this.activeStreams = 0;
    this.timers = [];
  }

  /**
   * Applies a new configuration and (re)starts camera refresh and event polling.
   * `otp` is a one-time 2-factor code; it is only used for this configuration and never stored.
   */
  configure(cfg, otp = null) {
    this.stop();
    this.cfg = cfg;
    this.pendingOtp = otp ? String(otp).replace(/\s+/g, '') : null;
    this.sid = null;
    this.apis = null;
    this.cameras = [];
    this.connected = false;
    this.authFailed = false;
    this.error = null;
    this.seen.clear();
    this.reasonStats = {};
    this.primed = false;
    this.snapshots.clear();
    if (!cfg?.enabled || !cfg.host) return;
    this.agent = cfg.https
      ? new https.Agent({ rejectUnauthorized: Boolean(cfg.verifySsl), keepAlive: true })
      : new http.Agent({ keepAlive: true });
    this.refreshCameras();
    this.timers.push(setInterval(() => this.refreshCameras(), CAMERA_REFRESH_MS));
    this.timers.push(setInterval(() => this.pollEvents(), Math.max(2, cfg.pollSeconds || 5) * 1000));
  }

  /** Stops all timers and closes the keep-alive connections. */
  stop() {
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.agent?.destroy();
    this.agent = null;
  }

  /** True if the integration is switched on and a host is configured. */
  get enabled() {
    return Boolean(this.cfg?.enabled && this.cfg.host);
  }

  /** Base URL of DSM, e.g. http://nas:5000 */
  get origin() {
    return `${this.cfg.https ? 'https' : 'http'}://${this.cfg.host}:${this.cfg.port || (this.cfg.https ? 5001 : 5000)}`;
  }

  /**
   * Low-level request. Returns the raw response so that JSON, images and
   * endless MJPEG streams can all be handled by the caller.
   */
  open(pathname, params = {}, { post = false, timeout = 10000 } = {}) {
    return new Promise((resolve, reject) => {
      const body = new URLSearchParams(params).toString();
      const url = new URL(this.origin + pathname);
      if (!post && body) url.search = body;
      const lib = this.cfg.https ? https : http;
      const req = lib.request(
        url,
        {
          method: post ? 'POST' : 'GET',
          agent: this.agent,
          timeout,
          headers: post ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } : {},
        },
        resolve,
      );
      req.on('timeout', () => req.destroy(new Error('Zeitüberschreitung')));
      req.on('error', reject);
      if (post) req.write(body);
      req.end();
    });
  }

  /** Reads a complete response body into a Buffer. */
  async readBody(res) {
    const chunks = [];
    for await (const c of res) chunks.push(c);
    return Buffer.concat(chunks);
  }

  /** Request whose answer is JSON (all Web API methods except images and streams). */
  async json(pathname, params, opts) {
    const res = await this.open(pathname, params, opts);
    const text = (await this.readBody(res)).toString('utf8');
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Unerwartete Antwort der Synology (HTTP ${res.statusCode})`);
    }
  }

  /** Discovers paths and versions of the APIs used here (SYNO.API.Info). */
  async loadApis() {
    const names = [
      'SYNO.API.Auth',
      'SYNO.SurveillanceStation.Camera',
      'SYNO.SurveillanceStation.Event',
      'SYNO.SurveillanceStation.Recording',
      'SYNO.SurveillanceStation.VideoStreaming',
    ];
    const res = await this.json('/webapi/query.cgi', { api: 'SYNO.API.Info', version: 1, method: 'Query', query: names.join(',') });
    if (!res.success) throw new Error('API-Informationen konnten nicht gelesen werden');
    this.apis = res.data;
    if (!this.apis['SYNO.SurveillanceStation.Camera']) throw new Error('Surveillance Station ist nicht installiert oder nicht aktiv');
  }

  /** Path and version range of an API, or null if the station does not offer it. */
  api(name) {
    const a = this.apis?.[name];
    return a ? { path: '/webapi/' + a.path, max: a.maxVersion, min: a.minVersion } : null;
  }

  /**
   * Logs in and stores the session id.
   *
   * 2-factor accounts: the first login needs the current one-time code (`otp_code`) together with
   * `enable_device_token=yes`. DSM answers with a device id (`did`) that is emitted as `deviceId`
   * event and saved by the server. All later logins send that `device_id` instead of a code.
   */
  async login() {
    if (!this.apis) await this.loadApis();
    const auth = this.api('SYNO.API.Auth');
    const params = {
      api: 'SYNO.API.Auth',
      version: Math.min(auth.max, 6),
      method: 'login',
      account: this.cfg.account,
      passwd: this.cfg.password,
      session: 'SurveillanceStation',
      format: 'sid',
    };
    if (this.cfg.deviceId) {
      params.device_id = this.cfg.deviceId;
      params.device_name = 'HomeApp';
    }
    if (this.pendingOtp) {
      params.otp_code = this.pendingOtp;
      params.enable_device_token = 'yes';
      params.device_name = 'HomeApp';
      delete params.device_id;
    }
    const res = await this.json(auth.path, params, { post: true });
    if (res.success && this.pendingOtp) {
      this.pendingOtp = null; // a code is valid once only
      if (res.data?.did) {
        this.cfg.deviceId = res.data.did; // later session renewals in this run use it right away
        this.emit('deviceId', res.data.did);
      }
    }
    if (!res.success) {
      const code = res.error?.code;
      if (this.pendingOtp) this.pendingOtp = null; // never replay a rejected code
      const err = new Error(AUTH_ERRORS[code] || `Anmeldung fehlgeschlagen (Code ${code})`);
      // Credential/policy problems do not fix themselves: stop retrying so DSM's auto-block is not triggered
      err.fatal = typeof code === 'number' && code in AUTH_ERRORS;
      throw err;
    }
    this.sid = res.data.sid;
  }

  /**
   * Runs `attempt` (resolves with `{ ok: value }` on success or `{ code }` with the API error code)
   * and repeats it once after a new login if the session had expired.
   * @param {() => Promise<{ok: any}|{code: number|undefined}>} attempt
   * @param {(code: number|undefined) => string} failure error message for a final failure
   */
  async withSession(attempt, failure) {
    if (!this.sid) await this.login();
    for (let i = 0; i < 2; i++) {
      const res = await attempt();
      if ('ok' in res) return res.ok;
      if (i === 0 && SESSION_ERRORS.has(res.code)) {
        await this.login();
        continue;
      }
      throw new Error(failure(res.code));
    }
  }

  /** Calls a JSON API method and logs in again if the session expired. */
  call(apiName, method, params = {}, version) {
    return this.withSession(
      async () => {
        const api = this.api(apiName);
        if (!api) throw new Error(`${apiName} wird von dieser Surveillance Station nicht angeboten`);
        const res = await this.json(api.path, { api: apiName, method, version: Math.min(api.max, version ?? api.max), _sid: this.sid, ...params });
        return res.success ? { ok: res.data } : { code: res.error?.code };
      },
      (code) => `${apiName}.${method} fehlgeschlagen (Code ${code})`,
    );
  }

  /**
   * Loads the camera list (every 60 s). Different Surveillance Station versions wrap the list
   * slightly differently, so several shapes are accepted. An empty list is reported in the log
   * and as a hint in the status, because it usually means missing camera privileges.
   */
  async refreshCameras() {
    if (this.authFailed) return;
    try {
      const data = (await this.call('SYNO.SurveillanceStation.Camera', 'List', {}, 9)) || {};
      const raw = data.cameras ?? data.camera ?? data.data?.cameras ?? (Array.isArray(data) ? data : []);
      this.cameras = raw.map((c) => ({
        id: String(c.id ?? c.camId ?? c.cameraId),
        name: c.newName || c.name || `Kamera ${c.id}`,
        // the list reports `newName`; `status` codes differ between versions, so no camera is treated as disabled
        enabled: c.enabled ?? true,
      }));
      this.connected = true;
      this.error = this.cameras.length
        ? null
        : 'Die Surveillance Station liefert keine Kameras. Prüfe in DSM, ob das Konto für die Kameras berechtigt ist (Live-Ansicht).';
      if (!this.cameras.length && !this.warnedEmpty) {
        this.warnedEmpty = true;
        console.warn('[Surveillance] Camera.List ohne Kameras. Antwortfelder:', Object.keys(data), 'total =', data.total);
      } else if (this.cameras.length) {
        this.warnedEmpty = false;
      }
    } catch (err) {
      this.connected = false;
      this.error = err.message;
      this.sid = null;
      if (err.fatal) this.authFailed = true; // retried only after the configuration was saved again
    }
    this.emit('status');
  }

  /**
   * Polls the event list (recordings) and classifies NEW entries by their `reason` code:
   *   - reasons in `peopleReasons`  -> advanced detection (kind "people")
   *   - reasons in `eventReasons`   -> normal motion (kind "motion")
   *   - everything else (e.g. reason 0 = continuous recording, a new block every 30 min) is ignored.
   *
   * Note: cameras that record continuously produce no motion entries here at all. Use the webhook
   * (Surveillance Station action rule) for them. The first poll only remembers what already exists.
   * Every reason code that was seen is counted so the settings page can show what the station delivers.
   */
  async pollEvents() {
    if (!this.connected) return;
    try {
      const people = parseCodes(this.cfg.peopleReasons);
      const motion = parseCodes(this.cfg.eventReasons);
      const data = await this.call('SYNO.SurveillanceStation.Event', 'List', { offset: 0, limit: 50, fromTime: Math.floor(Date.now() / 1000) - 300, toTime: 0 }, 5);
      const list = data?.events || [];
      const fresh = list.filter((r) => !this.seen.has(String(r.id)));
      for (const r of list) this.seen.add(String(r.id));
      if (this.seen.size > 500) this.seen = new Set([...this.seen].slice(-200)); // keep the memory bounded
      if (!this.primed) {
        this.primed = true;
        return;
      }
      for (const r of fresh) {
        const reason = String(r.reason ?? '');
        const stat = (this.reasonStats[reason] ??= { count: 0, last: 0 });
        stat.count++;
        stat.last = Date.now();
        const cameraId = String(r.cameraId ?? r.camera_id ?? r.camId ?? '');
        const kind = people.has(reason) ? 'people' : motion.has(reason) ? 'motion' : null;
        if (cameraId && kind) this.emit('motion', { cameraId, source: 'Surveillance Station', kind, reason });
      }
    } catch (err) {
      this.error = err.message;
    }
  }

  /**
   * JPEG snapshot of a camera. Requests arriving within SNAPSHOT_CACHE_MS share one upstream request,
   * so many open browsers do not multiply the load on the NAS.
   * @param {string} id camera id
   * @param {'high'|'balanced'|'low'} quality stream profile the snapshot is taken from
   * @returns {Promise<{body: Buffer, type: string}>}
   */
  async snapshot(id, quality = 'balanced') {
    const cached = this.snapshots.get(id);
    if (cached && Date.now() - cached.ts < SNAPSHOT_CACHE_MS) return cached.promise;
    const promise = this.fetchSnapshot(id, quality);
    this.snapshots.set(id, { ts: Date.now(), promise });
    promise.catch(() => this.snapshots.delete(id));
    return promise;
  }

  /** Loads a snapshot. The API answers with an image on success and with JSON on errors. */
  fetchSnapshot(id, quality) {
    const profileType = { high: 0, balanced: 1, low: 2 }[quality] ?? 1;
    return this.withSession(
      async () => {
        const api = this.api('SYNO.SurveillanceStation.Camera');
        const res = await this.open(api.path, {
          api: 'SYNO.SurveillanceStation.Camera',
          method: 'GetSnapshot',
          version: api.max >= 9 ? 9 : 1,
          id, // version 9
          cameraId: id, // older versions
          profileType,
          _sid: this.sid,
        });
        const body = await this.readBody(res);
        const type = res.headers['content-type'] || '';
        if (type.startsWith('image/')) return { ok: { body, type } };
        try {
          return { code: JSON.parse(body.toString()).error?.code ?? res.statusCode };
        } catch {
          return { code: res.statusCode }; // not json
        }
      },
      (code) => `Snapshot nicht verfügbar (Code ${code})`,
    );
  }

  /** Opens the MJPEG live stream of a camera and returns the upstream response. */
  async openStream(id) {
    if (this.activeStreams >= MAX_STREAMS) throw new Error('Zu viele gleichzeitige Streams');
    if (!this.sid) await this.login();
    let pathWithQuery = null;
    try {
      const data = await this.call('SYNO.SurveillanceStation.Camera', 'GetLiveViewPath', { idList: id }, 9);
      const raw = (Array.isArray(data) ? data : data?.data || [])[0]?.mjpegHttpPath;
      if (raw) {
        const u = new URL(raw);
        pathWithQuery = u.pathname + u.search;
      }
    } catch {
      /* falls back to the documented direct URL */
    }
    const direct = { api: 'SYNO.SurveillanceStation.VideoStreaming', version: 1, method: 'Stream', format: 'mjpeg', cameraId: id };
    const url = new URL(this.origin + (pathWithQuery || '/webapi/entry.cgi'));
    if (!pathWithQuery) for (const [k, v] of Object.entries(direct)) url.searchParams.set(k, v);
    if (!url.searchParams.has('_sid')) url.searchParams.set('_sid', this.sid);
    const res = await this.open(url.pathname + url.search, {}, { timeout: 15000 });
    if (res.statusCode !== 200 || !(res.headers['content-type'] || '').includes('multipart')) {
      res.resume();
      throw new Error('MJPEG-Stream nicht verfügbar');
    }
    this.activeStreams++;
    res.on('close', () => this.activeStreams--);
    return res;
  }

  /** Connection info for the status display (incl. the reason codes seen so far). */
  status() {
    return { enabled: this.enabled, connected: this.connected, error: this.error, cameras: this.cameras.length, reasonStats: this.reasonStats };
  }
}
