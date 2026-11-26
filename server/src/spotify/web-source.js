/**
 * Player source for a connected Spotify account (Web API, access token renewed with the refresh token).
 */
import { finiteOrNull } from '../util/number.js';
import { ACCOUNTS, API, SEARCH_LIMIT, SpotifyError, spotifyFetch, spotifyMessage } from './api.js';
import { collection, list, normalizeDevices, normalizeItem, normalizePlayback, normalizeSearch } from './normalize.js';

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
    return list(r?.items).filter((p) => p.uri).map((p) => collection('playlist', p, p.owner?.display_name ?? '', finiteOrNull(p.items?.total ?? p.tracks?.total)));
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
