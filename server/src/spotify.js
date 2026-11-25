/**
 * Spotify (Spotify Connect) through the Spotify Web API.
 *
 * Authorisation: authorization code flow with PKCE, so only the client id of an app from the Spotify
 * developer dashboard is needed (no client secret). Its redirect URI is
 * `https://<HomeApp address>/api/spotify/callback`. After the one-time login the server keeps the
 * refresh token (a secret in config.json) and renews the access token itself; nothing of it reaches
 * the browser.
 *
 * The server polls the playback state (GET /me/player) every few seconds and pushes it (`data`). The
 * browsers control playback through the server: play / pause, skip, seek, volume, shuffle, repeat,
 * transfer to a device, play a track / album / playlist / artist and add to the queue. Search,
 * playlists, devices, queue and recently played tracks are proxied on demand.
 *
 * Development mode of the Web API (since February 2026): the owner of the app needs Spotify Premium,
 * at most 5 users, search returns at most 10 items per type. Controlling playback needs Premium.
 *
 * In demo mode without a connected account a simulated player ({@link DemoSpotifySource}) is shown.
 */
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

const ACCOUNTS = 'https://accounts.spotify.com';
const API = 'https://api.spotify.com/v1';
/** Everything the player page needs: read and control playback, the own playlists, recently played. */
export const SPOTIFY_SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-recently-played',
].join(' ');
export const REPEAT_MODES = ['off', 'context', 'track'];
const LOGIN_TTL_MS = 10 * 60000;
const IDLE_POLL_MS = 10000;
const ERROR_RETRY_MS = 15000;
const REQUEST_TIMEOUT_MS = 10000;
const RETRY_DELAY_MS = 1000;
const SEARCH_LIMIT = 10; // maximum of the development mode
const DNS_ERRORS = new Set(['ENOTFOUND', 'EAI_AGAIN', 'EAI_FAIL', 'EAI_NODATA', 'EAI_NONAME']);
/** The connection could not be made: nothing reached Spotify, so the request may be sent again. */
const CONNECT_ERRORS = new Set([...DNS_ERRORS, 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT']);
const URI = /^spotify:[a-z]+(?::[A-Za-z0-9._-]+)+$/;

const range = (v, min, max, fallback) => {
  const n = Number(v);
  return v === null || v === undefined || v === '' || !Number.isFinite(n) ? fallback : Math.min(max, Math.max(min, n));
};
const text = (v, max) => String(v ?? '').trim().slice(0, max);
const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const list = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);

/** Cleans the `spotify` section of the configuration. `refreshToken` and `account` are written by the login only. */
export function sanitizeSpotify(o = {}) {
  const s = o && typeof o === 'object' ? o : {};
  return {
    enabled: Boolean(s.enabled),
    clientId: text(s.clientId, 100).replace(/\s+/g, ''),
    refreshToken: text(s.refreshToken, 2000),
    account: text(s.account, 100),
    device: text(s.device, 100),
    onlyDevice: s.onlyDevice !== false,
    dashboard: s.dashboard !== false,
    pauseMinutes: range(s.pauseMinutes, 0, 120, 5),
    pollSeconds: range(s.pollSeconds, 2, 30, 3),
  };
}

/* ------------------------------------------------------------------ login (PKCE) */

/** Random code verifier and its S256 challenge. */
export function pkcePair() {
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

/** Redirect URI of HomeApp for the address the browser uses (`https://192.168.1.5:8095`); null if invalid. */
export function redirectUriFor(origin) {
  try {
    const u = new URL(String(origin));
    return u.protocol === 'https:' || u.protocol === 'http:' ? `${u.origin}/api/spotify/callback` : null;
  } catch {
    return null;
  }
}

/** Address of Spotify's consent page. */
export function authorizeUrl({ clientId, redirectUri, state, challenge }) {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SPOTIFY_SCOPES,
    state,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });
  return `${ACCOUNTS}/authorize?${params}`;
}

/* ------------------------------------------------------------------ data */

/** Url of the image closest to `want` pixels (Spotify lists the largest first). */
export function pickImage(images, want) {
  const imgs = list(images).filter((i) => typeof i.url === 'string' && i.url);
  if (!imgs.length) return null;
  const sorted = [...imgs].sort((a, b) => (a.width ?? 9999) - (b.width ?? 9999));
  return (sorted.find((i) => (i.width ?? 9999) >= want) ?? sorted.at(-1)).url;
}

/** Track or podcast episode in the form the browser uses. */
export function normalizeItem(item) {
  if (!item || typeof item !== 'object' || !item.uri) return null;
  const episode = item.type === 'episode';
  const images = episode ? (item.images?.length ? item.images : item.show?.images) : item.album?.images;
  return {
    id: text(item.id, 100),
    uri: text(item.uri, 200),
    type: episode ? 'episode' : 'track',
    name: text(item.name, 200),
    artists: episode ? text(item.show?.name || item.show?.publisher, 200) : list(item.artists).map((a) => text(a.name, 100)).filter(Boolean).join(', '),
    album: episode ? '' : text(item.album?.name, 200),
    albumUri: !episode && item.album?.uri ? text(item.album.uri, 200) : null,
    image: pickImage(images, 300),
    imageSmall: pickImage(images, 64),
    duration: numOrNull(item.duration_ms) ?? 0,
  };
}

const ALL_ALLOWED = { next: true, previous: true, seek: true, shuffle: true, repeat: true };

/** Playback state from GET /me/player (null / empty = nothing active). */
export function normalizePlayback(p) {
  if (!p || typeof p !== 'object') {
    return { active: false, playing: false, device: null, track: null, progress: 0, shuffle: false, repeat: 'off', context: null, can: { ...ALL_ALLOWED } };
  }
  const dev = p.device && typeof p.device === 'object' ? p.device : null;
  const dis = p.actions?.disallows ?? {};
  return {
    active: Boolean(dev),
    playing: Boolean(p.is_playing),
    device: dev ? { id: dev.id ? text(dev.id, 100) : null, name: text(dev.name, 100), type: text(dev.type, 40), volume: numOrNull(dev.volume_percent), supportsVolume: dev.supports_volume !== false } : null,
    track: normalizeItem(p.item),
    progress: numOrNull(p.progress_ms) ?? 0,
    shuffle: Boolean(p.shuffle_state),
    repeat: REPEAT_MODES.includes(p.repeat_state) ? p.repeat_state : 'off',
    context: p.context?.uri ? { uri: text(p.context.uri, 200), type: text(p.context.type, 20) } : null,
    can: {
      next: !dis.skipping_next,
      previous: !dis.skipping_prev,
      seek: !dis.seeking,
      shuffle: !dis.toggling_shuffle,
      repeat: !dis.toggling_repeat_context && !dis.toggling_repeat_track,
    },
  };
}

/** Album, artist or playlist as a playable collection. */
function collection(kind, o, subtitle, total = null) {
  return { id: text(o.id, 100), uri: text(o.uri, 200), kind, name: text(o.name, 200), subtitle: text(subtitle, 200), image: pickImage(o.images, 300), total };
}

/** Search result: tracks, albums, artists and playlists (Spotify sometimes sends `null` entries). */
export function normalizeSearch(r) {
  const items = (k) => list(r?.[k]?.items).filter((x) => x.uri);
  return {
    tracks: items('tracks').map(normalizeItem).filter(Boolean),
    albums: items('albums').map((a) => collection('album', a, list(a.artists).map((x) => x.name).filter(Boolean).join(', '))),
    artists: items('artists').map((a) => collection('artist', a, (Array.isArray(a.genres) ? a.genres.filter((g) => typeof g === 'string') : []).slice(0, 2).join(', ') || 'Künstler')),
    playlists: items('playlists').map((p) => collection('playlist', p, p.owner?.display_name ?? '', numOrNull(p.items?.total ?? p.tracks?.total))),
  };
}

/** Devices from GET /me/player/devices. */
export function normalizeDevices(r) {
  return list(r?.devices).filter((d) => d.id).map((d) => ({
    id: text(d.id, 100),
    name: text(d.name, 100),
    type: text(d.type, 40),
    active: Boolean(d.is_active),
    restricted: Boolean(d.is_restricted),
    volume: numOrNull(d.volume_percent),
    supportsVolume: d.supports_volume !== false,
  }));
}

/** Device with the given name (case and surrounding spaces ignored). */
export const findDevice = (devices, name) => {
  const want = String(name || '').trim().toLowerCase();
  return want ? devices.find((d) => d.name.trim().toLowerCase() === want) ?? null : null;
};

/** Error of the Web API with a German message; `fatal`: the login is gone, polling stops until it is renewed. */
export class SpotifyError extends Error {
  constructor(status, message, reason = null) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

/** German explanation of an error answer of the Web API. */
export function spotifyMessage(status, reason, message = '') {
  if (reason === 'PREMIUM_REQUIRED') return 'Die Steuerung erfordert Spotify Premium.';
  if (reason === 'NO_ACTIVE_DEVICE') return 'Kein aktives Spotify-Gerät – wähle ein Gerät aus oder starte Spotify auf dem Verstärker.';
  if (status === 401) return 'Spotify-Anmeldung abgelaufen – in den Einstellungen neu verbinden.';
  if (status === 403 && /not registered|developer dashboard/i.test(message)) return 'Dieses Spotify-Konto ist für die App nicht freigegeben – im Spotify-Developer-Dashboard unter „User Management“ eintragen.';
  if (status === 403) return `Spotify erlaubt diese Aktion nicht${message ? ` (${message})` : ''}.`;
  if (status === 404) return reason ? `Nicht gefunden (${reason}).` : 'Gerät oder Inhalt nicht gefunden – ist der Verstärker eingeschaltet?';
  if (status === 429) return 'Zu viele Anfragen an Spotify – bitte kurz warten.';
  if (status >= 500) return 'Spotify ist gerade nicht erreichbar.';
  return message || `Spotify antwortet mit Fehler ${status}.`;
}

/** Error code of a failed `fetch`: Node only says "fetch failed" and keeps the reason in `cause` (several addresses: AggregateError). */
export function networkCode(err) {
  const cause = err?.cause ?? err;
  return String(cause?.code ?? list(cause?.errors).find((e) => e.code)?.code ?? '');
}

/** German explanation of a request to `host` that got no answer (name resolution, connection, certificate, timeout). */
export function networkMessage(err, host) {
  const code = networkCode(err);
  const why = (() => {
    if (err?.name === 'TimeoutError') return `${host} antwortet nicht (Zeitüberschreitung) – hat der Server bzw. Docker-Container Internetzugang?`;
    if (DNS_ERRORS.has(code)) return `${host} lässt sich nicht auflösen (${code}) – DNS des Servers bzw. Docker-Containers prüfen`;
    if (CONNECT_ERRORS.has(code)) return `keine Verbindung zu ${host} (${code}) – hat der Server bzw. Docker-Container Internetzugang?`;
    if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ERR_TLS|ERR_SSL/.test(code)) return `Zertifikat von ${host} nicht akzeptiert (${code}) – stimmt die Uhrzeit des Servers, prüft ein Proxy / eine Firewall HTTPS?`;
    if (code === 'ECONNRESET' || code === 'EPIPE' || code.startsWith('UND_ERR')) return `Verbindung zu ${host} abgebrochen (${code}) – Firewall / Proxy prüfen`;
    const msg = err?.cause?.message || err?.message || 'unbekannter Fehler';
    return `${host}: ${msg}${code && !msg.includes(code) ? ` (${code})` : ''}`;
  })();
  return `Spotify nicht erreichbar: ${why}.`;
}

/**
 * `fetch` with a timeout. A failed connection is tried once more (nothing reached Spotify yet, so even
 * the one-time code of the login stays valid). Without an answer it throws a {@link SpotifyError} that
 * names the reason and keeps the original error as `cause`.
 */
export async function spotifyFetch(fetchImpl, url, init = {}, { retryDelay = RETRY_DELAY_MS } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (err) {
      if (attempt === 0 && CONNECT_ERRORS.has(networkCode(err))) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        continue;
      }
      const e = new SpotifyError(502, networkMessage(err, new URL(url).host));
      e.cause = err;
      throw e;
    }
  }
}

/** Validates a control command from the browser; throws a 400 error for anything unknown. */
export function sanitizeCommand(action, p = {}) {
  const bad = () => new SpotifyError(400, 'Ungültiger Befehl');
  const deviceId = p.deviceId == null || p.deviceId === '' ? null : text(p.deviceId, 100);
  const uri = (v) => {
    const u = text(v, 200);
    if (!URI.test(u)) throw bad();
    return u;
  };
  switch (action) {
    case 'pause':
    case 'next':
    case 'previous':
      return { action };
    case 'play': {
      const cmd = { action, deviceId };
      if (p.uris !== undefined) {
        if (!Array.isArray(p.uris) || !p.uris.length || p.uris.length > 50) throw bad();
        cmd.uris = p.uris.map(uri);
      } else if (p.contextUri !== undefined) {
        cmd.contextUri = uri(p.contextUri);
        if (p.offsetUri !== undefined) cmd.offsetUri = uri(p.offsetUri);
      }
      return cmd;
    }
    case 'seek':
      return { action, position: Math.round(range(p.position, 0, 24 * 3600e3, 0)) };
    case 'volume':
      if (!Number.isFinite(Number(p.volume))) throw bad();
      return { action, volume: Math.round(range(p.volume, 0, 100, 0)) };
    case 'shuffle':
      return { action, state: Boolean(p.state) };
    case 'repeat':
      if (!REPEAT_MODES.includes(p.state)) throw bad();
      return { action, state: p.state };
    case 'transfer':
      if (!deviceId) throw bad();
      return { action, deviceId, play: p.play !== false };
    case 'queue':
      return { action, uri: uri(p.uri) };
    default:
      throw bad();
  }
}

/* ------------------------------------------------------------------ Web API */

/** Talks to the Web API with the stored refresh token (access token renewed automatically). */
export class SpotifyWebSource {
  /**
   * @param {object} cfg sanitized `spotify` configuration
   * @param {{fetchImpl?: typeof fetch, onRefreshToken?: (token: string) => void, retryDelay?: number}} opts
   */
  constructor(cfg, { fetchImpl = (...a) => fetch(...a), onRefreshToken, retryDelay } = {}) {
    this.cfg = { ...cfg };
    this.fetch = (url, init) => spotifyFetch(fetchImpl, url, init, { retryDelay });
    this.onRefreshToken = onRefreshToken;
    this.access = null;
    this.expires = 0;
    this.refreshing = null;
  }

  /** Valid access token; parallel callers share one renewal. */
  token() {
    if (this.access && Date.now() < this.expires - 60000) return Promise.resolve(this.access);
    this.refreshing ??= this.refresh().finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  async refresh() {
    const res = await this.fetch(`${ACCOUNTS}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: this.cfg.refreshToken, client_id: this.cfg.clientId }).toString(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const revoked = data.error === 'invalid_grant' || data.error === 'invalid_client';
      const err = new SpotifyError(401, revoked ? 'Spotify-Anmeldung abgelaufen oder widerrufen – in den Einstellungen neu verbinden.' : `Spotify-Anmeldung fehlgeschlagen (${data.error_description || data.error || res.status}).`);
      err.fatal = revoked;
      throw err;
    }
    this.access = data.access_token;
    this.expires = Date.now() + (Number(data.expires_in) || 3600) * 1000;
    // PKCE refresh tokens may be rotated: the new one has to be stored
    if (data.refresh_token && data.refresh_token !== this.cfg.refreshToken) {
      this.cfg.refreshToken = data.refresh_token;
      this.onRefreshToken?.(data.refresh_token);
    }
    return this.access;
  }

  /** Request to the Web API; a rejected access token is renewed once. Empty answers resolve to null. */
  async call(method, path, { query, body } = {}) {
    for (let attempt = 0; ; attempt++) {
      const token = await this.token();
      const url = new URL(API + path);
      for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      const res = await this.fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (res.status === 401 && attempt === 0) {
        this.access = null;
        continue;
      }
      const raw = res.status === 204 ? '' : await res.text();
      let data = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        data = null;
      }
      if (res.ok) return data;
      const e = data?.error;
      const err = new SpotifyError(res.status, spotifyMessage(res.status, e?.reason ?? null, typeof e === 'string' ? e : e?.message ?? ''), e?.reason ?? null);
      if (res.status === 429) err.retryAfter = Number(res.headers.get('retry-after')) || 5;
      throw err;
    }
  }

  async read() {
    return normalizePlayback(await this.call('GET', '/me/player', { query: { additional_types: 'episode' } }));
  }

  async devices() {
    return normalizeDevices(await this.call('GET', '/me/player/devices'));
  }

  async search(q) {
    return normalizeSearch(await this.call('GET', '/search', { query: { q, type: 'track,album,artist,playlist', limit: SEARCH_LIMIT } }));
  }

  async playlists() {
    const r = await this.call('GET', '/me/playlists', { query: { limit: 50 } });
    return list(r?.items).filter((p) => p.uri).map((p) => collection('playlist', p, p.owner?.display_name ?? '', numOrNull(p.items?.total ?? p.tracks?.total)));
  }

  async queue() {
    const r = await this.call('GET', '/me/player/queue');
    return list(r?.queue).map(normalizeItem).filter(Boolean).slice(0, 20);
  }

  async recent() {
    const r = await this.call('GET', '/me/player/recently-played', { query: { limit: 30 } });
    const seen = new Set();
    return list(r?.items).map((i) => normalizeItem(i.track)).filter((t) => t && !seen.has(t.uri) && seen.add(t.uri)).slice(0, 20);
  }

  /** Executes a sanitized command (see {@link sanitizeCommand}). */
  async command(c) {
    const device = c.deviceId ? { device_id: c.deviceId } : undefined;
    switch (c.action) {
      case 'play': {
        let body;
        if (c.uris) body = { uris: c.uris };
        else if (c.contextUri) body = { context_uri: c.contextUri, ...(c.offsetUri ? { offset: { uri: c.offsetUri } } : {}) };
        return this.call('PUT', '/me/player/play', { query: device, body });
      }
      case 'pause':
        return this.call('PUT', '/me/player/pause');
      case 'next':
        return this.call('POST', '/me/player/next');
      case 'previous':
        return this.call('POST', '/me/player/previous');
      case 'seek':
        return this.call('PUT', '/me/player/seek', { query: { position_ms: c.position } });
      case 'volume':
        return this.call('PUT', '/me/player/volume', { query: { volume_percent: c.volume } });
      case 'shuffle':
        return this.call('PUT', '/me/player/shuffle', { query: { state: c.state } });
      case 'repeat':
        return this.call('PUT', '/me/player/repeat', { query: { state: c.state } });
      case 'transfer':
        return this.call('PUT', '/me/player', { body: { device_ids: [c.deviceId], play: c.play } });
      case 'queue':
        return this.call('POST', '/me/player/queue', { query: { uri: c.uri } });
    }
  }

  close() {}
}

/* ------------------------------------------------------------------ demo */

/** Simulated catalogue (invented titles) for the demo mode. */
const DEMO_TRACKS = [
  ['Neon Horizon', 'Lumen Drive', 'Night Circuits', 214000],
  ['Glass Rivers', 'Aurora Lane', 'Northern Lights', 236000],
  ['Kaffee am Fenster', 'Die Morgenstunden', 'Sonntag', 198000],
  ['Midnight Tram', 'Lumen Drive', 'Night Circuits', 251000],
  ['Paper Planes Over Berlin', 'Echo Atlas', 'Cities', 223000],
  ['Slow Tide', 'Aurora Lane', 'Northern Lights', 268000],
  ['Wolkenreise', 'Die Morgenstunden', 'Sonntag', 205000],
  ['Golden Static', 'Echo Atlas', 'Cities', 189000],
  ['Velvet Engine', 'Lumen Drive', 'Night Circuits', 242000],
  ['Herbstlicht', 'Fjord & Feuer', 'Jahreszeiten', 231000],
].map(([name, artist, album, duration], i) => ({
  id: `demo${i}`,
  uri: `spotify:track:demo${i}`,
  type: 'track',
  name,
  artists: artist,
  album,
  albumUri: `spotify:album:demo${album.replace(/\W/g, '')}`,
  image: `/api/spotify/demo-cover/${i}`,
  imageSmall: `/api/spotify/demo-cover/${i}`,
  duration,
}));

const DEMO_PLAYLISTS = [
  { name: 'Abendlicht', tracks: [1, 5, 9, 2, 6] },
  { name: 'Fokus am Schreibtisch', tracks: [0, 3, 8, 4, 7] },
  { name: 'Sonntagsfrühstück', tracks: [2, 6, 9, 1] },
  { name: 'Party im Wohnzimmer', tracks: [4, 7, 0, 8, 3] },
].map((p, i) => ({ id: `demo-pl${i}`, uri: `spotify:playlist:demopl${i}`, kind: 'playlist', name: p.name, subtitle: 'Demo', image: `/api/spotify/demo-cover/${10 + i}`, total: p.tracks.length, tracks: p.tracks }));

const DEMO_DEVICES = [
  { id: 'demo-amp', name: 'Verstärker Wohnzimmer', type: 'AVR', supportsVolume: true },
  { id: 'demo-kitchen', name: 'Küche', type: 'Speaker', supportsVolume: true },
  { id: 'demo-phone', name: 'Smartphone', type: 'Smartphone', supportsVolume: false },
];

/** Square cover of the demo catalogue: a colour gradient with the initials of the title. */
export function demoCoverSvg(n) {
  const i = Math.abs(Math.trunc(Number(n))) % 20 || 0;
  const name = i < 10 ? DEMO_TRACKS[i].name : DEMO_PLAYLISTS[(i - 10) % DEMO_PLAYLISTS.length].name;
  const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase().replace(/[<&>]/g, '');
  const h = (i * 47) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h},70%,55%)"/><stop offset="1" stop-color="hsl(${(h + 70) % 360},65%,22%)"/></linearGradient></defs>
<rect width="300" height="300" fill="url(#g)"/>
<circle cx="230" cy="70" r="90" fill="rgba(255,255,255,.08)"/><circle cx="60" cy="250" r="70" fill="rgba(0,0,0,.15)"/>
<text x="24" y="270" fill="#fff" font-family="Arial, sans-serif" font-weight="700" font-size="88" opacity=".9">${initials}</text>
</svg>`;
}

/** Simulated Spotify Connect player for the demo mode: plays the demo catalogue, all controls work. */
export class DemoSpotifySource {
  constructor(now = Date.now()) {
    this.order = DEMO_TRACKS.map((_, i) => i);
    this.pos = 2;
    this.playing = true;
    this.position = 47000;
    this.since = now;
    this.volume = 35;
    this.shuffle = false;
    this.repeat = 'off';
    this.deviceId = 'demo-amp';
    this.context = { uri: DEMO_PLAYLISTS[0].uri, type: 'playlist' };
    this.history = [];
  }

  current() {
    return DEMO_TRACKS[this.order[this.pos]];
  }

  progress(now) {
    return this.playing ? this.position + (now - this.since) : this.position;
  }

  /** Moves on to the next track(s) once the current one has ended. */
  advance(now) {
    for (let guard = 0; guard < 50 && this.progress(now) >= this.current().duration; guard++) {
      const over = this.progress(now) - this.current().duration;
      if (this.repeat !== 'track') this.step(1);
      this.position = 0;
      this.since = now - over;
    }
  }

  step(dir) {
    this.history.unshift(this.current());
    this.history = this.history.slice(0, 20);
    const n = this.order.length;
    this.pos = this.shuffle ? Math.floor(Math.random() * n) : (this.pos + dir + n) % n;
  }

  async read(now = Date.now()) {
    this.advance(now);
    const dev = DEMO_DEVICES.find((d) => d.id === this.deviceId);
    return {
      active: true,
      playing: this.playing,
      device: { id: dev.id, name: dev.name, type: dev.type, volume: dev.supportsVolume ? this.volume : null, supportsVolume: dev.supportsVolume },
      track: { ...this.current() },
      progress: Math.round(this.progress(now)),
      shuffle: this.shuffle,
      repeat: this.repeat,
      context: this.context,
      can: { ...ALL_ALLOWED },
    };
  }

  async devices() {
    return DEMO_DEVICES.map((d) => ({ ...d, active: d.id === this.deviceId, restricted: false, volume: d.supportsVolume ? this.volume : null }));
  }

  async search(q) {
    const want = String(q || '').toLowerCase();
    const hit = (s) => s.toLowerCase().includes(want);
    const tracks = DEMO_TRACKS.filter((t) => hit(`${t.name} ${t.artists} ${t.album}`)).slice(0, SEARCH_LIMIT);
    const albums = [...new Map(DEMO_TRACKS.filter((t) => hit(`${t.album} ${t.artists}`)).map((t, i) => [t.album, { id: t.albumUri, uri: t.albumUri, kind: 'album', name: t.album, subtitle: t.artists, image: t.image, total: null, i }])).values()];
    const artists = [...new Map(DEMO_TRACKS.filter((t) => hit(t.artists)).map((t) => [t.artists, { id: t.artists, uri: `spotify:artist:demo${t.artists.replace(/\W/g, '')}`, kind: 'artist', name: t.artists, subtitle: 'Künstler', image: t.image, total: null }])).values()];
    const playlists = DEMO_PLAYLISTS.filter((p) => hit(p.name)).map(({ tracks: _t, ...p }) => p);
    return { tracks: tracks.map((t) => ({ ...t })), albums: albums.map(({ i: _i, ...a }) => a), artists, playlists };
  }

  async playlists() {
    return DEMO_PLAYLISTS.map(({ tracks: _t, ...p }) => p);
  }

  async queue() {
    return Array.from({ length: Math.min(8, this.order.length - 1) }, (_, k) => ({ ...DEMO_TRACKS[this.order[(this.pos + k + 1) % this.order.length]] }));
  }

  async recent() {
    return this.history.map((t) => ({ ...t }));
  }

  /** Plays a context: playlist, album or artist of the demo catalogue. */
  playContext(uri, offsetUri) {
    const pl = DEMO_PLAYLISTS.find((p) => p.uri === uri);
    let idx = pl ? pl.tracks : DEMO_TRACKS.map((t, i) => [t, i]).filter(([t]) => t.albumUri === uri || `spotify:artist:demo${t.artists.replace(/\W/g, '')}` === uri).map(([, i]) => i);
    if (!idx.length) idx = DEMO_TRACKS.map((_, i) => i);
    this.order = idx;
    const start = DEMO_TRACKS.findIndex((t) => t.uri === offsetUri);
    this.pos = Math.max(0, idx.indexOf(start));
    this.context = { uri, type: uri.split(':')[1] };
  }

  async command(c, now = Date.now()) {
    this.advance(now);
    const at = this.progress(now);
    const restart = () => {
      this.position = 0;
      this.since = now;
    };
    switch (c.action) {
      case 'play':
        if (c.deviceId && DEMO_DEVICES.some((d) => d.id === c.deviceId)) this.deviceId = c.deviceId;
        if (c.uris) {
          this.order = c.uris.map((u) => DEMO_TRACKS.findIndex((t) => t.uri === u)).filter((i) => i >= 0);
          if (!this.order.length) this.order = [0];
          this.pos = 0;
          this.context = null;
          restart();
        } else if (c.contextUri) {
          this.playContext(c.contextUri, c.offsetUri);
          restart();
        } else {
          this.position = at;
          this.since = now;
        }
        this.playing = true;
        break;
      case 'pause':
        this.position = at;
        this.since = now;
        this.playing = false;
        break;
      case 'next':
        this.step(1);
        restart();
        break;
      case 'previous':
        if (at > 3000) restart();
        else {
          this.step(-1);
          restart();
        }
        break;
      case 'seek':
        this.position = Math.min(c.position, this.current().duration - 1000);
        this.since = now;
        break;
      case 'volume':
        this.volume = c.volume;
        break;
      case 'shuffle':
        this.shuffle = c.state;
        break;
      case 'repeat':
        this.repeat = c.state;
        break;
      case 'transfer':
        if (!DEMO_DEVICES.some((d) => d.id === c.deviceId)) throw new SpotifyError(404, spotifyMessage(404, null));
        this.deviceId = c.deviceId;
        this.position = at;
        this.since = now;
        this.playing = c.play || this.playing;
        break;
      case 'queue':
        this.order.splice(this.pos + 1, 0, Math.max(0, DEMO_TRACKS.findIndex((t) => t.uri === c.uri)));
        break;
    }
    return null;
  }

  close() {}
}

/* ------------------------------------------------------------------ service */

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
    const query = text(q, 200);
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
    const id = text(clientId, 100);
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
    if (error) throw new SpotifyError(403, error === 'access_denied' ? 'Zugriff in Spotify abgelehnt.' : `Spotify meldet: ${text(error, 100)}`);
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
      account = text(profile.display_name || profile.id, 100);
    } catch (err) {
      // only a refused account stops the login; without the name (e.g. no answer) it is just not shown
      if (err instanceof SpotifyError && err.status === 403) throw err;
      /* the name is only shown in the settings */
    }
    return { refreshToken: tokens.refresh_token, account, clientId: login.clientId };
  }
}

/** Effect of a successful command on the state, shown until the next poll confirms it. */
export function optimistic(c, data, now = Date.now()) {
  switch (c.action) {
    case 'play':
      return { playing: true, lastPlayingAt: now, ...(c.uris || c.contextUri ? { progress: 0 } : {}) };
    case 'transfer':
      return c.play ? { playing: true, lastPlayingAt: now } : {};
    case 'pause':
      return { playing: false, lastPlayingAt: now };
    case 'next':
    case 'previous':
      return { progress: 0 };
    case 'seek':
      return { progress: c.position };
    case 'volume':
      return data.device ? { device: { ...data.device, volume: c.volume } } : {};
    case 'shuffle':
      return { shuffle: c.state };
    case 'repeat':
      return { repeat: c.state };
    default:
      return {};
  }
}
