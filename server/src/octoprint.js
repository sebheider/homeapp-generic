/**
 * 3D printer via OctoPrint.
 *
 * The server polls the OctoPrint REST API, authenticated with an application key (API key) in the
 * `X-Api-Key` header (checked against OctoPrint 1.8):
 *   - GET /api/version, /api/currentuser, /api/settings   version, user of the key, printer name and
 *                                                         webcam settings (on connect, then every 10 min)
 *   - GET /api/job                                        state, file and progress (every poll)
 *   - GET /api/printer                                    state flags and temperatures (every poll;
 *                                                         409 while the printer is not connected)
 *   - GET /api/printer?history=true                       temperature curve of the last ~30 minutes
 * The webcam picture (snapshot and MJPEG stream) is proxied, so neither the key nor the internal
 * webcam address reach the browser. OctoPi reports its snapshot address as `127.0.0.1:8080`, which only
 * works on the Pi itself; the address is therefore derived from the stream URL
 * (`/webcam/?action=stream` -> `/webcam/?action=snapshot`) with fallbacks, or set by hand.
 *
 * {@link PrinterService} runs the polling, emits the printer state (`data`), the connection (`status`)
 * and `popup`: every `popupMinutes` while a print is running and once when it ends. In demo mode
 * without a configured printer a simulated one ({@link DemoPrinterSource}) is shown.
 *
 * Instead of OctoPrint (`type: 'octoprint'`) the printer may be a Bambu Lab printer (`type: 'bambu'`,
 * connection in the `bambu` section, see bambu.js). The `octoprint` section keeps the settings both
 * share (on/off, name, webcam display, overview, pop-ups).
 */
import http from 'node:http';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { BambuSource, demoBambu, sanitizeBambu } from './bambu.js';

/** Where the webcam pop-up appears and how large it is (same choices as the camera pop-up). */
export const PRINTER_POPUP_POSITIONS = ['center', 'corner'];
export const PRINTER_POPUP_SIZES = ['medium', 'large', 'full'];
/** Kinds of printer connection. */
export const PRINTER_TYPES = ['octoprint', 'bambu'];
/** States in which a print job runs – the printer counts as "active". */
export const ACTIVE_STATES = new Set(['printing', 'pausing', 'paused', 'cancelling', 'finishing']);

const OFFLINE_RETRY_MS = 15000;
const META_REFRESH_MS = 10 * 60000;
const SNAPSHOT_CACHE_MS = 1000;
const SNAPSHOT_ERROR_CACHE_MS = 3000;
const MAX_STREAMS = 4;
const MAX_JSON_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** Most points of a temperature curve sent to the browser. */
const TEMP_POINTS = 300;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '0.0.0.0', '[::1]']);
const DEMO_NAME = 'Prusa MK4 (Demo)';
const DEMO_BAMBU_NAME = 'Bambu Lab P1S (Demo)';
/** Fields whose change needs a new connection (everything else is applied while polling continues). */
const CONNECTION_FIELDS = ['enabled', 'host', 'port', 'https', 'verifySsl', 'apiKey', 'snapshotUrl', 'streamUrl'];

const range = (v, min, max, fallback) => {
  const n = Number(v);
  return v === null || v === undefined || v === '' || !Number.isFinite(n) ? fallback : Math.min(max, Math.max(min, n));
};
const text = (v, max) => String(v ?? '').trim().slice(0, max);
/** Finite number or null. */
const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const round1 = (v) => (v === null ? null : Math.round(v * 10) / 10);

/**
 * Cleans the `octoprint` section of the configuration. A pasted address ("http://octopi.local:5000/")
 * is split into host, port and HTTPS.
 */
export function sanitizeOctoPrint(o = {}) {
  const src = o && typeof o === 'object' ? o : {};
  let host = text(src.host, 200);
  let secure = Boolean(src.https);
  let port = range(src.port, 1, 65535, secure ? 443 : 80);
  const url = /^(https?):\/\/([^/:?#\s]+)(?::(\d+))?/i.exec(host);
  const hostPort = /^([^/:?#\s]+):(\d+)$/.exec(host);
  if (url) {
    secure = url[1].toLowerCase() === 'https';
    host = url[2];
    port = url[3] ? range(url[3], 1, 65535, port) : secure ? 443 : 80;
  } else if (hostPort) {
    host = hostPort[1];
    port = range(hostPort[2], 1, 65535, port);
  } else {
    host = host.replace(/[/?#\s].*$/, '');
  }
  return {
    enabled: Boolean(src.enabled),
    type: PRINTER_TYPES.includes(src.type) ? src.type : 'octoprint',
    name: text(src.name, 80),
    host,
    port: Math.round(port),
    https: secure,
    verifySsl: Boolean(src.verifySsl),
    apiKey: text(src.apiKey, 200),
    pollSeconds: range(src.pollSeconds, 2, 60, 5),
    snapshotUrl: text(src.snapshotUrl, 500),
    streamUrl: text(src.streamUrl, 500),
    webcamRefreshSeconds: range(src.webcamRefreshSeconds, 0.5, 300, 2),
    webcamLive: src.webcamLive !== false,
    dashboard: src.dashboard !== false,
    popup: src.popup !== false,
    popupMinutes: range(src.popupMinutes, 1, 240, 15),
    popupSeconds: range(src.popupSeconds, 3, 600, 20),
    popupOnFinish: src.popupOnFinish !== false,
    popupPosition: PRINTER_POPUP_POSITIONS.includes(src.popupPosition) ? src.popupPosition : 'corner',
    popupSize: PRINTER_POPUP_SIZES.includes(src.popupSize) ? src.popupSize : 'medium',
  };
}

/**
 * Normalised printer state from OctoPrint's state text (`/api/job`) and – if the printer is connected –
 * its state flags (`/api/printer`): offline, connecting, idle, printing, pausing, paused, cancelling,
 * finishing, error or unknown.
 */
export function printerState(stateText, flags) {
  if (flags && typeof flags === 'object') {
    if (flags.cancelling) return 'cancelling';
    if (flags.pausing) return 'pausing';
    if (flags.paused) return 'paused';
    if (flags.finishing) return 'finishing';
    if (flags.printing || flags.resuming) return 'printing';
    if (flags.error) return 'error';
    if (flags.operational || flags.ready) return 'idle';
  }
  const t = String(stateText || '').toLowerCase();
  if (!t) return 'unknown';
  if (t.includes('cancel')) return 'cancelling';
  if (t.includes('pausing')) return 'pausing';
  if (t.includes('paused')) return 'paused';
  if (t.includes('finishing')) return 'finishing';
  if (t.includes('error')) return 'error';
  if (/offline|closed/.test(t)) return 'offline';
  // uploads to the SD card keep the printer busy but are no print job
  if (/sending|transferring/.test(t)) return 'idle';
  if (/printing|starting|resuming/.test(t)) return 'printing';
  if (/connect|detect|opening/.test(t)) return 'connecting';
  if (/operational|ready/.test(t)) return 'idle';
  return 'unknown';
}

/** Hotends (tool0 … n), bed and chamber with actual and target temperature; other sensors are left out. */
export function readTemps(temperature) {
  if (!temperature || typeof temperature !== 'object') return [];
  const tools = Object.keys(temperature).filter((k) => /^tool\d+$/.test(k)).sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)));
  const out = [];
  const add = (key, label) => {
    const e = temperature[key];
    const actual = numOrNull(e?.actual);
    if (actual !== null) out.push({ key, label, actual: round1(actual), target: round1(numOrNull(e.target)) });
  };
  tools.forEach((k, i) => add(k, tools.length > 1 ? `Düse ${i + 1}` : 'Düse'));
  add('bed', 'Bett');
  add('chamber', 'Kammer');
  return out;
}

/**
 * Temperature curves from OctoPrint's history (`time` in Unix seconds), at most {@link TEMP_POINTS}
 * points each: `{ tool0: { label, actual: [[ms, °C], …], target: [[ms, °C], …] }, bed: … }`.
 */
export function tempHistory(history) {
  const list = Array.isArray(history) ? history.filter((e) => e && Number.isFinite(Number(e.time))) : [];
  const out = {};
  if (!list.length) return out;
  const sensors = readTemps(list.at(-1));
  const step = Math.max(1, Math.ceil(list.length / TEMP_POINTS));
  // start so that the newest entry is always included
  for (let i = (list.length - 1) % step; i < list.length; i += step) {
    const e = list[i];
    const t = Number(e.time) * 1000;
    for (const { key, label } of sensors) {
      const actual = numOrNull(e[key]?.actual);
      if (actual === null) continue;
      const s = (out[key] ??= { label, actual: [], target: [] });
      s.actual.push([t, round1(actual)]);
      const target = numOrNull(e[key]?.target);
      if (target !== null) s.target.push([t, round1(target)]);
    }
  }
  return out;
}

/**
 * Webcam settings from `/api/settings`. OctoPrint up to 1.8 keeps them in `webcam`, from 1.9 in the
 * plugin `classicwebcam`; both are read. Null if the settings could not be read.
 */
export function webcamSettings(settings) {
  if (!settings || typeof settings !== 'object') return null;
  const w = settings.webcam && typeof settings.webcam === 'object' ? settings.webcam : {};
  const c = settings.plugins?.classicwebcam && typeof settings.plugins.classicwebcam === 'object' ? settings.plugins.classicwebcam : {};
  const pick = (...v) => v.find((x) => x !== undefined && x !== null && x !== '');
  return {
    enabled: w.webcamEnabled !== false,
    streamUrl: String(pick(c.stream, w.streamUrl) ?? ''),
    snapshotUrl: String(pick(c.snapshot, w.snapshotUrl) ?? ''),
    flipH: Boolean(pick(c.flipH, w.flipH)),
    flipV: Boolean(pick(c.flipV, w.flipV)),
    rotate90: Boolean(pick(c.rotate90, w.rotate90)),
    ratio: String(pick(c.streamRatio, w.streamRatio) ?? '') === '4:3' ? '4:3' : '16:9',
  };
}

/** Base address of OctoPrint, e.g. `http://192.168.1.20` (default ports are left out). */
export const originOf = (cfg) => `${cfg.https ? 'https' : 'http'}://${cfg.host}${cfg.port === (cfg.https ? 443 : 80) ? '' : `:${cfg.port}`}`;

/**
 * Addresses to try for the webcam picture (`snapshot`) or the MJPEG stream (`stream`), best first.
 * A hand-made address wins; relative addresses are resolved against OctoPrint, loopback addresses
 * (OctoPi: `http://127.0.0.1:8080/?action=snapshot`) point to the OctoPrint host instead.
 */
export function webcamUrls(cfg, webcam, kind) {
  const origin = originOf(cfg);
  const out = [];
  const add = (u) => {
    if (!u) return;
    try {
      const url = new URL(u, `${origin}/`);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
      if (LOOPBACK.has(url.hostname)) url.hostname = cfg.host;
      if (!out.includes(url.href)) out.push(url.href);
    } catch {
      /* not a URL */
    }
  };
  const own = kind === 'snapshot' ? cfg.snapshotUrl : cfg.streamUrl;
  if (own) {
    add(own);
    return out;
  }
  const stream = webcam?.streamUrl || '';
  if (kind === 'snapshot') {
    if (/action=stream/.test(stream)) add(stream.replace('action=stream', 'action=snapshot'));
    add(webcam?.snapshotUrl);
    add('/webcam/?action=snapshot');
  } else {
    add(stream);
    add('/webcam/?action=stream');
  }
  return out;
}

/** Printer state, job and progress from the answers of `/api/job` and `/api/printer` (null while not connected). */
export function normalizeStatus({ job, printer } = {}) {
  const flags = printer?.state?.flags ?? null;
  const stateText = text(job?.state || printer?.state?.text, 120);
  const state = printerState(stateText, flags);
  const file = job?.job?.file;
  const prog = job?.progress && typeof job.progress === 'object' ? job.progress : null;
  let filament = null;
  const fil = job?.job?.filament;
  if (fil && typeof fil === 'object') {
    const total = Object.values(fil).reduce((sum, f) => sum + (numOrNull(f?.length) ?? 0), 0);
    filament = total > 0 ? Math.round(total) : null;
  }
  const completion = numOrNull(prog?.completion);
  return {
    state,
    stateText,
    printerError: text(printer?.state?.error || job?.error, 300) || null,
    job: file?.name
      ? {
          file: text(file.display || file.name, 200),
          path: text(file.path || file.name, 300),
          origin: file.origin === 'sdcard' ? 'sdcard' : 'local',
          size: numOrNull(file.size),
          user: job.job.user ? text(job.job.user, 80) : null,
          estimatedPrintTime: numOrNull(job.job.estimatedPrintTime),
          filament,
        }
      : null,
    progress: prog
      ? {
          completion: completion === null ? null : Math.min(100, Math.max(0, completion)),
          printTime: numOrNull(prog.printTime),
          printTimeLeft: numOrNull(prog.printTimeLeft),
          printTimeLeftOrigin: prog.printTimeLeftOrigin ? text(prog.printTimeLeftOrigin, 40) : null,
        }
      : null,
    temps: readTemps(printer?.temperature),
  };
}

/** How a print ended: `done`, `cancelled` or `error` (from the last active state and the first one after it). */
export function finishReason(lastState, lastCompletion, now) {
  if (now?.state === 'error') return 'error';
  if (lastState === 'cancelling') return 'cancelled';
  const completion = now?.progress?.completion ?? lastCompletion ?? 0;
  if (lastState === 'finishing' || completion >= 99.5) return 'done';
  if (now?.state === 'offline') return 'error';
  return 'cancelled';
}

/** German explanation of a failed request. */
export function connectionMessage(err) {
  const code = String(err?.code || '');
  const msg = String(err?.message || '');
  if (err?.status === 401 || err?.status === 403) return 'API-Key ungültig oder ohne Berechtigung (OctoPrint → Einstellungen → Application Keys)';
  if (code === 'ECONNREFUSED') return 'OctoPrint nicht erreichbar (Verbindung abgelehnt) – Host und Port prüfen';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'Host nicht gefunden – Adresse prüfen';
  if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY/.test(code) || /certificate/i.test(msg)) return 'Zertifikat nicht vertrauenswürdig – „Zertifikat prüfen“ ausschalten oder ein gültiges Zertifikat verwenden';
  if (code === 'EPROTO' || /wrong version number|ssl/i.test(msg)) return 'HTTPS-Einstellung passt nicht zum Port';
  if (['EHOSTUNREACH', 'ENETUNREACH', 'ETIMEDOUT', 'ECONNRESET'].includes(code)) return 'OctoPrint nicht erreichbar – läuft der Drucker-Rechner (z. B. Raspberry Pi)?';
  return msg || 'Unbekannter Fehler';
}

/** Reads a complete response body; fails above `limit` bytes. */
async function readBody(res, limit) {
  const chunks = [];
  let size = 0;
  for await (const c of res) {
    size += c.length;
    if (size > limit) {
      res.destroy();
      throw new Error('Antwort zu groß');
    }
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

/** Talks to one OctoPrint instance (state, webcam, temperature history). */
export class OctoPrintSource {
  constructor(cfg) {
    this.cfg = cfg;
    this.origin = originOf(cfg);
    try {
      this.base = new URL(this.origin).origin;
    } catch {
      this.base = null;
    }
    this.agents = {
      http: new http.Agent({ keepAlive: true }),
      https: new https.Agent({ keepAlive: true, rejectUnauthorized: Boolean(cfg.verifySsl) }),
    };
    this.meta = null;
    this.metaAt = 0;
    this.goodSnapshot = null; // address that delivered the last picture
  }

  /** GET request; the key is only sent to OctoPrint itself, never to another webcam host. */
  open(href, { timeout = 8000, json = false } = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(href);
      const secure = url.protocol === 'https:';
      const headers = json ? { Accept: 'application/json' } : {};
      if (url.origin === this.base && this.cfg.apiKey) headers['X-Api-Key'] = this.cfg.apiKey;
      const req = (secure ? https : http).request(url, { method: 'GET', agent: this.agents[secure ? 'https' : 'http'], timeout, headers }, resolve);
      req.on('timeout', () => req.destroy(Object.assign(new Error('Zeitüberschreitung'), { code: 'ETIMEDOUT' })));
      req.on('error', reject);
      req.end();
    });
  }

  /** JSON request to the API; `allow` lists status codes that mean "no data" (answer null). */
  async get(path, allow = []) {
    if (!this.base) throw new Error('Ungültige Adresse');
    const res = await this.open(this.origin + path, { json: true });
    const body = await readBody(res, MAX_JSON_BYTES);
    if (allow.includes(res.statusCode)) return null;
    if (res.statusCode >= 400) throw Object.assign(new Error(`OctoPrint antwortet mit HTTP ${res.statusCode}`), { status: res.statusCode });
    try {
      return JSON.parse(body.toString('utf8'));
    } catch {
      throw new Error('Unerwartete Antwort (kein JSON) – ist das die Adresse von OctoPrint?');
    }
  }

  /** Version, user of the key, printer name and webcam settings; each part may be missing (permissions). */
  async loadMeta() {
    const quiet = (p) => this.get(p).catch(() => null);
    const [version, user, settings] = await Promise.all([quiet('/api/version'), quiet('/api/currentuser'), quiet('/api/settings')]);
    if (!version) return;
    this.meta = {
      version: text(version.text || (version.server ? `OctoPrint ${version.server}` : ''), 60) || null,
      user: user?.name ? text(user.name, 80) : null,
      name: text(settings?.appearance?.name, 80),
      webcam: webcamSettings(settings),
    };
    this.metaAt = Date.now();
  }

  /** Current state (throws if OctoPrint is not reachable or the key is not accepted). */
  async read() {
    if (!this.meta || Date.now() - this.metaAt > META_REFRESH_MS) await this.loadMeta();
    const [job, printer] = await Promise.all([this.get('/api/job'), this.get('/api/printer?exclude=sd', [409])]);
    return { ...normalizeStatus({ job, printer }), meta: this.meta };
  }

  /** Temperature curves of the last ~30 minutes (empty while the printer is not connected). */
  async temps() {
    const data = await this.get('/api/printer?history=true&limit=900&exclude=sd,state', [409]);
    return tempHistory(data?.temperature?.history);
  }

  /** Current webcam picture; the address that worked last time is tried first. */
  async snapshot() {
    const urls = webcamUrls(this.cfg, this.meta?.webcam, 'snapshot');
    const ordered = urls.includes(this.goodSnapshot) ? [this.goodSnapshot, ...urls.filter((u) => u !== this.goodSnapshot)] : urls;
    let last = null;
    for (const href of ordered) {
      try {
        const res = await this.open(href);
        const type = String(res.headers['content-type'] || '');
        if (res.statusCode !== 200 || !type.startsWith('image/')) {
          // destroy instead of draining: a stream URL given as snapshot address would never end
          res.destroy();
          throw new Error(`HTTP ${res.statusCode}${type ? ` (${type.split(';')[0]})` : ''}`);
        }
        const body = await readBody(res, MAX_IMAGE_BYTES);
        this.goodSnapshot = href;
        return { body, type };
      } catch (err) {
        last = err;
      }
    }
    throw new Error(`Webcam-Bild nicht verfügbar${last ? ` (${connectionMessage(last)})` : ''}`);
  }

  /** Opens the MJPEG stream of the webcam and returns the upstream response. */
  async openStream() {
    for (const href of webcamUrls(this.cfg, this.meta?.webcam, 'stream')) {
      try {
        const res = await this.open(href, { timeout: 15000 });
        if (res.statusCode === 200 && /multipart/i.test(String(res.headers['content-type'] || ''))) return res;
        res.destroy();
      } catch {
        /* next address */
      }
    }
    throw new Error('MJPEG-Stream der Webcam nicht verfügbar');
  }

  close() {
    this.agents.http.destroy();
    this.agents.https.destroy();
  }
}

/* ------------------------------------------------------------------ demo */

const DEMO_PRINT_MS = 40 * 60000;
const DEMO_IDLE_MS = 5 * 60000;
const DEMO_FILE = 'Benchy_0.2mm_PLA_MK4_40m.gcode';

/** Picture of the simulated webcam: a print bed with a boat that grows with the progress. */
function demoWebcamSvg(completion, printing, now) {
  const h = Math.round(130 * (completion / 100));
  const top = 282 - h;
  const x = printing ? 320 + Math.sin(now / 650) * 58 : 450;
  const nozzleY = printing ? top - 30 : 90;
  const time = new Date(now).toLocaleTimeString('de-DE');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d2433"/><stop offset="1" stop-color="#0b0f17"/></linearGradient>
<linearGradient id="pla" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c2410c"/><stop offset=".5" stop-color="#fb923c"/><stop offset="1" stop-color="#c2410c"/></linearGradient>
<pattern id="layers" width="8" height="3" patternUnits="userSpaceOnUse"><rect width="8" height="1" fill="rgba(0,0,0,.18)"/></pattern>
<clipPath id="grow"><rect x="0" y="${top}" width="640" height="${h + 1}"/></clipPath>
</defs>
<rect width="640" height="360" fill="url(#bg)"/>
<rect x="40" y="40" width="10" height="280" fill="#2b3446"/><rect x="590" y="40" width="10" height="280" fill="#2b3446"/>
<rect x="40" y="${nozzleY - 26}" width="560" height="12" rx="3" fill="#3a4458"/>
<path d="M120 282 L520 282 L590 330 L50 330Z" fill="#1f2937" stroke="#4b5563"/>
<path d="M120 282 L520 282 L540 296 L100 296Z" fill="#374151"/>
<g clip-path="url(#grow)">
<path d="M245 282 L395 282 L410 238 L372 226 L362 170 L318 170 L310 226 L232 238Z" fill="url(#pla)"/>
<path d="M245 282 L395 282 L410 238 L372 226 L362 170 L318 170 L310 226 L232 238Z" fill="url(#layers)"/>
</g>
<g><rect x="${x - 26}" y="${nozzleY - 40}" width="52" height="34" rx="5" fill="#f97316"/><rect x="${x - 26}" y="${nozzleY - 40}" width="52" height="8" rx="3" fill="#111827"/>
<path d="M${x - 8} ${nozzleY - 6} L${x + 8} ${nozzleY - 6} L${x + 2} ${nozzleY + 6} L${x - 2} ${nozzleY + 6}Z" fill="#d1d5db"/></g>
<text x="20" y="344" fill="#fff" font-family="monospace" font-size="18" opacity=".75">${time}</text>
<text x="620" y="344" text-anchor="end" fill="#fff" font-family="monospace" font-size="18" opacity=".6">DEMO</text>
</svg>`;
}

/**
 * Simulated printer for the demo mode: prints for 40 minutes, then rests for 5 minutes. With `bambu`
 * it plays a Bambu Lab printer (AMS, fans, light and speed, see demoBambu in bambu.js).
 */
export class DemoPrinterSource {
  constructor(now = Date.now(), { bambu = false } = {}) {
    this.start = now - 12 * 60000; // the demo starts in the middle of a print
    this.bambu = bambu ? { light: true, speed: 2 } : null;
  }

  phase(now) {
    const cycle = DEMO_PRINT_MS + DEMO_IDLE_MS;
    const t = (((now - this.start) % cycle) + cycle) % cycle;
    return t < DEMO_PRINT_MS ? { printing: true, t } : { printing: false, t: t - DEMO_PRINT_MS };
  }

  /** Nozzle and bed: [actual, target]. */
  tempsAt(now) {
    const p = this.phase(now);
    if (p.printing) {
      const wobble = Math.sin(now / 9000) * 0.6;
      const nozzle = p.t < 90000 ? 25 + 190 * (p.t / 90000) : 215 + wobble;
      const bed = p.t < 60000 ? 25 + 35 * (p.t / 60000) : 60 + wobble / 3;
      return { tool0: [nozzle, 215], bed: [bed, 60] };
    }
    return { tool0: [25 + 190 * Math.exp(-p.t / 90000), 0], bed: [25 + 35 * Math.exp(-p.t / 240000), 0] };
  }

  async read(now = Date.now()) {
    const p = this.phase(now);
    const t = this.tempsAt(now);
    const total = DEMO_PRINT_MS / 1000;
    const done = p.printing ? p.t / 1000 : total;
    if (this.bambu) return demoBambu({ printing: p.printing, done, total, temps: t, now, settings: this.bambu, name: DEMO_BAMBU_NAME });
    return {
      state: p.printing ? 'printing' : 'idle',
      stateText: p.printing ? 'Printing' : 'Operational',
      printerError: null,
      job: { file: DEMO_FILE, path: DEMO_FILE, origin: 'local', size: 2481337, user: 'demo', estimatedPrintTime: total, filament: 3812 },
      progress: { completion: Math.round((done / total) * 1000) / 10, printTime: Math.round(done), printTimeLeft: Math.round(total - done), printTimeLeftOrigin: 'estimate' },
      temps: [
        { key: 'tool0', label: 'Düse', actual: round1(t.tool0[0]), target: t.tool0[1] },
        { key: 'bed', label: 'Bett', actual: round1(t.bed[0]), target: t.bed[1] },
      ],
      meta: { version: 'OctoPrint (Demo)', user: 'demo', name: DEMO_NAME, webcam: { enabled: true, streamUrl: '', snapshotUrl: '', flipH: false, flipV: false, rotate90: false, ratio: '16:9' } },
    };
  }

  /** Last 30 minutes in steps of 10 seconds. */
  async temps(now = Date.now()) {
    const out = { tool0: { label: 'Düse', actual: [], target: [] }, bed: { label: 'Bett', actual: [], target: [] } };
    for (let ts = now - 30 * 60000; ts <= now; ts += 10000) {
      const v = this.tempsAt(ts);
      for (const k of ['tool0', 'bed']) {
        out[k].actual.push([ts, round1(v[k][0])]);
        out[k].target.push([ts, v[k][1]]);
      }
    }
    return out;
  }

  async snapshot(now = Date.now()) {
    const p = this.phase(now);
    const completion = p.printing ? (p.t / DEMO_PRINT_MS) * 100 : 100;
    return { body: Buffer.from(demoWebcamSvg(completion, p.printing, now)), type: 'image/svg+xml' };
  }

  async openStream() {
    throw new Error('Kein Live-Stream im Demo-Modus');
  }

  /** Light and speed are simulated; a demo print cannot be paused or stopped. */
  async command(action, params = {}) {
    if (!this.bambu) throw new Error('Steuerung ist nur für Bambu-Lab-Drucker verfügbar');
    if (action === 'light') this.bambu.light = Boolean(params.on);
    else if (action === 'speed' && [1, 2, 3, 4].includes(Number(params.level))) this.bambu.speed = Number(params.level);
    else if (['pause', 'resume', 'stop'].includes(action)) throw new Error('Im Demo-Modus nicht möglich');
    else throw new Error('Unbekannter Befehl');
  }

  close() {}
}

/* ------------------------------------------------------------------ service */

/**
 * Polls the printer and pushes its state. Events:
 *   - `data`    printer state for the browsers (only when something changed)
 *   - `status`  connection changed (for the status payload)
 *   - `popup`   `{ id, ts, reason, jobId }`: `interval` every `popupMinutes` while printing,
 *               `done` / `cancelled` / `error` when the print ended
 */
export class PrinterService extends EventEmitter {
  constructor() {
    super();
    this.cfg = sanitizeOctoPrint();
    this.bambuCfg = sanitizeBambu();
    this.kind = 'octoprint';
    this.source = null;
    this.demo = false;
    this.key = null;
    this.timer = null;
    this.generation = 0; // polls of an older configuration are dropped
    this.meta = null;
    this.snap = null;
    this.activeStreams = 0;
    this.resetTracking();
    this.data = this.baseData();
  }

  /**
   * Applies the configuration. A new connection is only made when connection fields change, so saving
   * other settings neither restarts the pop-up timer nor forgets the running print.
   * @param {object} cfg `octoprint` section of the configuration (shared printer settings)
   * @param {{demo?: boolean, bambu?: object}} opts demo mode: a simulated printer unless one is
   *   configured; `bambu`: section with the connection of a Bambu Lab printer
   */
  configure(cfg, { demo = false, bambu } = {}) {
    const next = sanitizeOctoPrint(cfg);
    const bambuCfg = sanitizeBambu(bambu);
    const isBambu = next.type === 'bambu';
    const real = Boolean(next.enabled && (isBambu ? bambuCfg.host && bambuCfg.serial && bambuCfg.accessCode : next.host));
    const conn = isBambu ? ['bambu', next.enabled, bambuCfg.host, bambuCfg.serial, bambuCfg.accessCode] : CONNECTION_FIELDS.map((f) => next[f]);
    const key = JSON.stringify([...conn, !real && demo]);
    this.cfg = next;
    this.bambuCfg = bambuCfg;
    if (key === this.key) {
      this.source?.reconfigure?.(bambuCfg);
      if (this.source) this.update(this.metaFields());
      return false;
    }
    this.stop();
    this.key = key;
    this.demo = !real && demo;
    this.kind = isBambu ? 'bambu' : 'octoprint';
    this.source = real ? (isBambu ? new BambuSource(bambuCfg) : new OctoPrintSource(next)) : this.demo ? new DemoPrinterSource(Date.now(), { bambu: isBambu }) : null;
    this.meta = null;
    this.snap = null;
    this.resetTracking();
    this.data = this.baseData();
    this.emit('data', this.data);
    this.emit('status');
    if (this.source) this.schedule(0);
    return true;
  }

  /** Stops polling and closes the connections. */
  stop() {
    clearTimeout(this.timer);
    this.timer = null;
    this.generation++;
    this.source?.close();
    this.source = null;
  }

  resetTracking() {
    this.wasActive = false;
    this.jobId = null;
    this.jobStartedAt = null;
    this.lastPopupAt = 0;
    this.lastState = null;
    this.lastCompletion = null;
  }

  /** Name shown when neither the configuration nor the printer has one. */
  defaultName() {
    if (this.kind === 'bambu') return this.demo ? DEMO_BAMBU_NAME : 'Bambu Lab';
    return this.demo ? DEMO_NAME : 'OctoPrint';
  }

  /** Whether the printer may be controlled from here (only Bambu Lab, and only when allowed). */
  controls() {
    return Boolean(this.source && this.kind === 'bambu' && this.bambuCfg.controls);
  }

  baseData() {
    return {
      enabled: Boolean(this.source),
      demo: this.demo,
      kind: this.kind ?? 'octoprint',
      controls: this.controls(),
      connected: false,
      error: null,
      name: this.cfg.name || this.defaultName(),
      version: null,
      user: null,
      state: 'offline',
      stateText: '',
      active: false,
      jobId: null,
      job: null,
      progress: null,
      temps: [],
      printerError: null,
      bambu: null,
      webcam: { available: false, flipH: false, flipV: false, rotate90: false, ratio: '16:9' },
      updatedAt: Date.now(),
    };
  }

  /** Name, version, user and webcam from the OctoPrint settings (or the own name from the configuration). */
  metaFields() {
    const m = this.meta;
    const w = m?.webcam;
    const ownSnapshot = this.kind !== 'bambu' && Boolean(this.cfg.snapshotUrl);
    return {
      name: this.cfg.name || m?.name || this.defaultName(),
      version: m?.version ?? null,
      user: m?.user ?? null,
      controls: this.controls(),
      // unknown settings (no permission to read them): try anyway
      webcam: { available: ownSnapshot || w?.enabled !== false, flipH: Boolean(w?.flipH), flipV: Boolean(w?.flipV), rotate90: Boolean(w?.rotate90), ratio: w?.ratio === '4:3' ? '4:3' : '16:9' },
    };
  }

  schedule(ms) {
    const gen = this.generation;
    this.timer = setTimeout(async () => {
      await this.poll();
      if (gen !== this.generation) return;
      // the Bambu source only copies the state the printer pushes, so it is read every second
      const every = this.source?.pollMs ?? this.cfg.pollSeconds * 1000;
      this.schedule(this.data.connected ? every : Math.max(every, this.source?.offlineMs ?? OFFLINE_RETRY_MS));
    }, ms);
    this.timer.unref?.();
  }

  /** Reads the printer once and updates state, job tracking and pop-ups. */
  async poll(now = Date.now()) {
    const src = this.source;
    if (!src) return;
    const gen = this.generation;
    let read;
    try {
      read = await src.read(now);
    } catch (err) {
      if (gen !== this.generation) return;
      // the running print is not forgotten: when OctoPrint is back, its pop-ups simply continue
      const error = src.describe ? src.describe(err) : connectionMessage(err);
      this.update({ connected: false, error, state: 'offline', stateText: '', active: false, temps: [], printerError: null });
      return;
    }
    if (gen !== this.generation) return;
    const { meta, ...status } = read;
    if (meta) this.meta = meta;
    const active = ACTIVE_STATES.has(status.state);
    const jobId = this.track(status, active, now);
    this.update({ ...status, ...this.metaFields(), connected: true, error: null, active, jobId });
  }

  /**
   * Follows the print job: id, regular pop-ups while it runs and one when it ends. Returns the job id.
   * Independent of the pop-up settings it emits `job` when a print pauses and when it ends (push notifications).
   */
  track(status, active, now) {
    const c = this.cfg;
    if (active) {
      if (!this.wasActive) {
        this.jobId = now.toString(36);
        this.jobStartedAt = now;
        this.lastPopupAt = now;
      } else {
        if (now - this.lastPopupAt >= c.popupMinutes * 60000) {
          this.lastPopupAt = now;
          if (c.popup) this.emitPopup('interval', now);
        }
        if (status.state === 'paused' && this.lastState !== 'paused') this.emitJob('paused', now, status);
      }
      this.lastState = status.state;
      if (status.progress?.completion != null) this.lastCompletion = status.progress.completion;
      this.wasActive = true;
      return this.jobId;
    }
    if (this.wasActive) {
      const reason = finishReason(this.lastState, this.lastCompletion, status);
      if (c.popupOnFinish) this.emitPopup(reason, now);
      this.emitJob(reason, now, status);
    }
    this.resetTracking();
    return null;
  }

  emitPopup(reason, now) {
    this.emit('popup', { id: `${this.jobId}-${now.toString(36)}`, ts: now, reason, jobId: this.jobId });
  }

  /** `job` event: phase ('paused', 'done', 'error', 'cancelled'), file, start time, progress and error text. */
  emitJob(phase, now, status) {
    this.emit('job', {
      phase,
      ts: now,
      jobId: this.jobId,
      startedAt: this.jobStartedAt ?? null,
      file: status.job?.file || this.data?.job?.file || null,
      completion: status.progress?.completion ?? this.lastCompletion ?? null,
      error: status.printerError || null,
    });
  }

  /** Merges `patch` into the state and emits `data` (and `status`) if something changed. */
  update(patch) {
    const prev = this.data;
    const next = { ...prev, ...patch, updatedAt: prev.updatedAt };
    if (JSON.stringify(next) === JSON.stringify(prev)) return;
    next.updatedAt = Date.now();
    this.data = next;
    this.emit('data', next);
    if (prev.connected !== next.connected || prev.error !== next.error) this.emit('status');
  }

  /** Connection info for the status display. */
  status() {
    return { enabled: Boolean(this.source), connected: this.data.connected, error: this.data.error, demo: this.demo };
  }

  /**
   * Current webcam picture. Requests within a second share one upstream request (failures are
   * remembered a little longer), so several open browsers do not multiply the load on the printer.
   */
  snapshot() {
    if (!this.source) return Promise.reject(new Error('Kein 3D-Drucker eingerichtet'));
    const s = this.snap;
    const age = Date.now() - (s?.ts ?? 0);
    if (s && (s.pending || age < (s.failed ? SNAPSHOT_ERROR_CACHE_MS : SNAPSHOT_CACHE_MS))) return s.promise;
    const entry = { ts: Date.now(), pending: true, failed: false, promise: null };
    const settle = (failed) => {
      entry.pending = false;
      entry.failed = failed;
      entry.ts = Date.now();
    };
    entry.promise = this.source.snapshot().then(
      (r) => (settle(false), r),
      (err) => {
        settle(true);
        throw err;
      },
    );
    entry.promise.catch(() => {}); // callers handle the error; a cached rejection must not count as unhandled
    this.snap = entry;
    return entry.promise;
  }

  /** MJPEG stream of the webcam (upstream response, to be piped to the browser). */
  async openStream() {
    if (!this.source) throw new Error('Kein 3D-Drucker eingerichtet');
    if (this.activeStreams >= MAX_STREAMS) throw new Error('Zu viele gleichzeitige Streams');
    const res = await this.source.openStream();
    this.activeStreams++;
    res.on('close', () => this.activeStreams--);
    return res;
  }

  /** Temperature curves of the last ~30 minutes. */
  async temps() {
    if (!this.source) throw new Error('Kein 3D-Drucker eingerichtet');
    return this.source.temps();
  }

  /**
   * Controls the printer (Bambu Lab only): `pause`, `resume`, `stop`, `light` ({ on }) or
   * `speed` ({ level }). The new state is pushed right away.
   */
  async command(action, params = {}) {
    if (!this.source) throw Object.assign(new Error('Kein 3D-Drucker eingerichtet'), { status: 404 });
    if (!this.controls() || !this.source.command) throw Object.assign(new Error('Steuerung des Druckers ist ausgeschaltet'), { status: 403 });
    await this.source.command(action, params);
    await this.poll();
  }
}
