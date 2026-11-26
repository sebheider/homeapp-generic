/**
 * Connection to one OctoPrint instance (REST API with the `X-Api-Key` header): state, webcam and
 * temperature history.
 */
import http from 'node:http';
import https from 'node:https';
import { trimText } from '../util/text.js';
import { normalizeStatus, tempHistory } from './status.js';
import { originOf, webcamSettings, webcamUrls } from './webcam.js';

const META_REFRESH_MS = 10 * 60000;

const MAX_JSON_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

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
      version: trimText(version.text || (version.server ? `OctoPrint ${version.server}` : ''), 60) || null,
      user: user?.name ? trimText(user.name, 80) : null,
      name: trimText(settings?.appearance?.name, 80),
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
