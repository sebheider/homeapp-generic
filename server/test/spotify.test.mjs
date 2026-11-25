// Spotify Connect: configuration, PKCE login, Web API client (token renewal, errors), commands,
// polling and the demo player – against a fake `fetch`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  DemoSpotifySource, SpotifyService, SpotifyWebSource, authorizeUrl, demoCoverSvg, findDevice, normalizeDevices, normalizePlayback, normalizeSearch, optimistic,
  pickImage, pkcePair, redirectUriFor, sanitizeCommand, sanitizeSpotify, spotifyMessage, networkMessage, spotifyFetch, SpotifyError,
} from '../src/spotify.js';

const json = (status, body, headers = {}) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

// GET /me/player while a track plays on an amplifier (shape of the Web API reference)
const PLAYER = {
  device: { id: 'amp1', is_active: true, name: 'AV-Receiver', type: 'AVR', volume_percent: 42, supports_volume: true },
  shuffle_state: true,
  repeat_state: 'context',
  progress_ms: 61000,
  is_playing: true,
  context: { type: 'playlist', uri: 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M' },
  item: {
    id: '4uLU6hMCjMI75M1A2tKUQC', uri: 'spotify:track:4uLU6hMCjMI75M1A2tKUQC', type: 'track', name: 'Song', duration_ms: 213000,
    artists: [{ name: 'Anna' }, { name: 'Ben' }],
    album: { name: 'Album', uri: 'spotify:album:1', images: [{ url: 'https://i.scdn.co/640', width: 640 }, { url: 'https://i.scdn.co/300', width: 300 }, { url: 'https://i.scdn.co/64', width: 64 }] },
  },
  actions: { disallows: { skipping_prev: true } },
};

/** Fake Spotify: routes by method + path, records every request. */
function fakeSpotify(routes) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? init.body : null;
    calls.push({ method, path: u.pathname, query: Object.fromEntries(u.searchParams), body, auth: init.headers?.Authorization ?? null });
    const handler = routes[`${method} ${u.pathname}`];
    return handler ? handler({ query: u.searchParams, body, init }) : json(404, { error: { status: 404, message: 'not found' } });
  };
  return { fetchImpl, calls };
}
const tokenRoute = (extra = {}) => () => json(200, { access_token: 'AT', token_type: 'Bearer', expires_in: 3600, ...extra });

test('sanitizeSpotify: defaults and limits', () => {
  const d = sanitizeSpotify();
  assert.deepEqual(d, { enabled: false, clientId: '', refreshToken: '', account: '', device: '', onlyDevice: true, dashboard: true, pauseMinutes: 5, pollSeconds: 3 });
  const s = sanitizeSpotify({ enabled: 1, clientId: ' abc 123 ', pauseMinutes: 999, pollSeconds: 0, onlyDevice: false, device: ' AV-Receiver ' });
  assert.equal(s.clientId, 'abc123');
  assert.equal(s.pauseMinutes, 120);
  assert.equal(s.pollSeconds, 2);
  assert.equal(s.onlyDevice, false);
  assert.equal(s.device, 'AV-Receiver');
  assert.equal(sanitizeSpotify(null).enabled, false);
});

test('PKCE login address', () => {
  const { verifier, challenge } = pkcePair();
  assert.match(verifier, /^[A-Za-z0-9_-]{43,128}$/);
  assert.equal(challenge, crypto.createHash('sha256').update(verifier).digest('base64url'));
  const url = new URL(authorizeUrl({ clientId: 'cid', redirectUri: 'https://192.168.1.5:8095/api/spotify/callback', state: 'st', challenge }));
  assert.equal(url.origin + url.pathname, 'https://accounts.spotify.com/authorize');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://192.168.1.5:8095/api/spotify/callback');
  assert.match(url.searchParams.get('scope'), /user-modify-playback-state/);
  assert.equal(redirectUriFor('https://192.168.1.5:8095/'), 'https://192.168.1.5:8095/api/spotify/callback');
  assert.equal(redirectUriFor('javascript:alert(1)'), null);
  assert.equal(redirectUriFor(undefined), null);
});

test('playback state, search and devices are normalised', () => {
  const p = normalizePlayback(PLAYER);
  assert.equal(p.active, true);
  assert.equal(p.playing, true);
  assert.deepEqual(p.device, { id: 'amp1', name: 'AV-Receiver', type: 'AVR', volume: 42, supportsVolume: true });
  assert.equal(p.track.artists, 'Anna, Ben');
  assert.equal(p.track.image, 'https://i.scdn.co/300');
  assert.equal(p.track.imageSmall, 'https://i.scdn.co/64');
  assert.equal(p.track.duration, 213000);
  assert.equal(p.repeat, 'context');
  assert.equal(p.shuffle, true);
  assert.equal(p.can.previous, false);
  assert.equal(p.can.next, true);
  const idle = normalizePlayback(null);
  assert.equal(idle.active, false);
  assert.equal(idle.track, null);
  const episode = normalizePlayback({ is_playing: false, device: { name: 'Handy' }, item: { uri: 'spotify:episode:1', type: 'episode', name: 'Folge 1', show: { name: 'Podcast', images: [{ url: 'x' }] } } });
  assert.equal(episode.track.type, 'episode');
  assert.equal(episode.track.artists, 'Podcast');
  assert.equal(episode.track.image, 'x');
  assert.equal(pickImage([], 64), null);

  const search = normalizeSearch({
    tracks: { items: [PLAYER.item, null] },
    albums: { items: [{ id: 'a', uri: 'spotify:album:a', name: 'A', artists: [{ name: 'X' }], images: [] }] },
    artists: { items: [{ id: 'r', uri: 'spotify:artist:r', name: 'R', genres: ['pop', 'rock', 'jazz'] }] },
    // playlists: since February 2026 `items` instead of `tracks`; null entries happen
    playlists: { items: [null, { id: 'p', uri: 'spotify:playlist:p', name: 'P', owner: { display_name: 'Me' }, items: { total: 12 } }, { id: 'q', uri: 'spotify:playlist:q', name: 'Q', tracks: { total: 3 } }] },
  });
  assert.equal(search.tracks.length, 1);
  assert.equal(search.albums[0].subtitle, 'X');
  assert.equal(search.artists[0].subtitle, 'pop, rock');
  assert.deepEqual(search.playlists.map((x) => x.total), [12, 3]);
  assert.deepEqual(normalizeSearch(undefined), { tracks: [], albums: [], artists: [], playlists: [] });

  const devices = normalizeDevices({ devices: [{ id: 'a', name: 'AV-Receiver ', type: 'AVR', is_active: false }, { name: 'no id' }] });
  assert.equal(devices.length, 1);
  assert.equal(findDevice(devices, 'av-receiver')?.id, 'a');
  assert.equal(findDevice(devices, ''), null);
});

test('commands are validated', () => {
  assert.deepEqual(sanitizeCommand('pause'), { action: 'pause' });
  assert.deepEqual(sanitizeCommand('volume', { volume: 140 }), { action: 'volume', volume: 100 });
  assert.deepEqual(sanitizeCommand('repeat', { state: 'track' }), { action: 'repeat', state: 'track' });
  assert.deepEqual(sanitizeCommand('play', { contextUri: 'spotify:album:1', offsetUri: 'spotify:track:2', deviceId: 'amp' }), { action: 'play', deviceId: 'amp', contextUri: 'spotify:album:1', offsetUri: 'spotify:track:2' });
  assert.deepEqual(sanitizeCommand('play', { uris: ['spotify:track:abc'] }), { action: 'play', deviceId: null, uris: ['spotify:track:abc'] });
  assert.deepEqual(sanitizeCommand('play', { contextUri: 'spotify:user:me:playlist:x' }).contextUri, 'spotify:user:me:playlist:x');
  for (const [action, p] of [['repeat', { state: 'all' }], ['volume', { volume: 'x' }], ['queue', { uri: 'https://evil' }], ['play', { uris: [] }], ['transfer', {}], ['rm -rf', {}], ['play', { contextUri: 'spotify:album:1/../x' }]]) {
    assert.throws(() => sanitizeCommand(action, p), (e) => e.status === 400, action);
  }
  assert.deepEqual(optimistic({ action: 'volume', volume: 10 }, { device: { name: 'A', volume: 50 } }), { device: { name: 'A', volume: 10 } });
  assert.equal(optimistic({ action: 'pause' }, {}).playing, false);
});

test('Web API client: renews the token, retries once on 401, keeps rotated refresh tokens, explains errors', async () => {
  let tokens = 0;
  let playerCalls = 0;
  const rotated = [];
  const { fetchImpl, calls } = fakeSpotify({
    'POST /api/token': ({ body }) => {
      tokens++;
      const form = new URLSearchParams(body);
      assert.equal(form.get('grant_type'), 'refresh_token');
      assert.equal(form.get('client_id'), 'cid');
      return tokenRoute(tokens === 2 ? { refresh_token: 'RT2' } : {})();
    },
    'GET /v1/me/player': () => (++playerCalls === 1 ? json(401, { error: { status: 401, message: 'expired' } }) : json(200, PLAYER)),
    'PUT /v1/me/player/pause': () => json(404, { error: { status: 404, message: 'Player command failed: No active device found', reason: 'NO_ACTIVE_DEVICE' } }),
    'PUT /v1/me/player/volume': () => json(429, { error: { status: 429 } }, { 'Retry-After': '7' }),
    'POST /v1/me/player/next': () => new Response(null, { status: 204 }),
  });
  const src = new SpotifyWebSource(sanitizeSpotify({ enabled: true, clientId: 'cid', refreshToken: 'RT1' }), { fetchImpl, onRefreshToken: (t) => rotated.push(t) });
  const state = await src.read();
  assert.equal(state.track.name, 'Song');
  assert.equal(tokens, 2, 'renewed after the 401');
  assert.deepEqual(rotated, ['RT2']);
  assert.equal(src.cfg.refreshToken, 'RT2');
  assert.equal(calls.filter((c) => c.path === '/v1/me/player').at(-1).auth, 'Bearer AT');
  assert.equal(await src.command({ action: 'next' }), null);
  await assert.rejects(src.command({ action: 'pause' }), (e) => e.status === 404 && e.reason === 'NO_ACTIVE_DEVICE' && /Kein aktives Spotify-Gerät/.test(e.message));
  await assert.rejects(src.command({ action: 'volume', volume: 20 }), (e) => e.status === 429 && e.retryAfter === 7);
  assert.equal(calls.find((c) => c.path === '/v1/me/player/volume').query.volume_percent, '20');

  const revoked = new SpotifyWebSource(sanitizeSpotify({ clientId: 'cid', refreshToken: 'old' }), { fetchImpl: async () => json(400, { error: 'invalid_grant', error_description: 'Refresh token revoked' }) });
  await assert.rejects(revoked.read(), (e) => e.fatal === true && /neu verbinden/.test(e.message));
  assert.match(spotifyMessage(403, 'PREMIUM_REQUIRED'), /Premium/);
  assert.match(spotifyMessage(403, null, 'User not registered in the Developer Dashboard'), /User Management/);
});

/** Service with a fake source (no timers). */
function service(source, cfg = {}) {
  const s = new SpotifyService();
  s.configure({ enabled: true, clientId: 'cid', refreshToken: 'rt', ...cfg });
  s.stop();
  s.source = source;
  return s;
}

test('Service: starting playback while nothing runs uses the chosen device (amplifier)', async () => {
  const commands = [];
  const source = {
    read: async () => normalizePlayback(null),
    devices: async () => [{ id: 'phone', name: 'Handy', active: false, restricted: false }, { id: 'amp', name: 'AV-Receiver', active: false, restricted: false }],
    command: async (c) => commands.push(c),
    close() {},
  };
  const s = service(source, { device: 'av-receiver' });
  await s.poll();
  assert.equal(s.data.active, false);
  await s.command('play');
  assert.deepEqual(commands.at(-1), { action: 'transfer', deviceId: 'amp', play: true });
  await s.command('play', { uris: ['spotify:track:abc'] });
  assert.deepEqual(commands.at(-1), { action: 'play', deviceId: 'amp', uris: ['spotify:track:abc'] });
  assert.equal(s.data.playing, true, 'shown right away');
  clearTimeout(s.timer);

  const none = service({ ...source, devices: async () => [] });
  await none.poll();
  await assert.rejects(none.command('play'), /Kein Spotify-Gerät/);
  await assert.rejects(new SpotifyService().command('pause'), (e) => e.status === 409);
});

test('Service: a read that started before a command does not undo it', async () => {
  let release;
  const slow = new Promise((r) => (release = r));
  let reads = 0;
  const source = {
    read: async () => (++reads === 1 ? slow : normalizePlayback({ ...PLAYER, is_playing: false })),
    command: async () => null,
    close() {},
  };
  const s = service(source);
  s.data = { ...s.data, active: true, playing: true };
  const pending = s.poll();
  await s.command('pause');
  assert.equal(s.data.playing, false);
  release(normalizePlayback(PLAYER)); // still "playing" – read before the pause
  assert.equal(await pending, null, 'outdated read does not reschedule');
  assert.equal(s.data.playing, false);
  clearTimeout(s.timer);
});

test('Service: pushed and served states carry the position of the moment, not of the last read', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100_000 });
  const s = service({ read: async () => normalizePlayback(PLAYER), command: async () => null, close() {} });
  await s.poll(Date.now());
  assert.equal(s.data.progress, 61000);
  t.mock.timers.tick(2500);
  assert.equal(s.current().progress, 63500, 'bootstrap / GET /api/spotify');
  await s.command('volume', { volume: 30 });
  assert.equal(s.data.progress, 63500, 'a volume change does not set the position back');
  t.mock.timers.tick(1000);
  await s.command('pause');
  assert.equal(s.data.progress, 64500, 'paused where it was');
  assert.equal(s.data.playing, false);
  t.mock.timers.tick(5000);
  assert.equal(s.current().progress, 64500, 'does not run on while paused');
  clearTimeout(s.timer);
});

test('Service: a token renewal finishing after a logout does not bring the old account back', async () => {
  let release;
  const fetchImpl = async (url) => {
    if (String(url).endsWith('/api/token')) {
      await new Promise((r) => (release = r));
      return json(200, { access_token: 'AT', refresh_token: 'OLD-ROTATED', expires_in: 3600 });
    }
    return json(200, PLAYER);
  };
  const s = new SpotifyService({ fetchImpl });
  const tokens = [];
  s.on('token', (tkn) => tokens.push(tkn));
  s.configure({ enabled: true, clientId: 'cid', refreshToken: 'OLD' });
  const src = s.source;
  s.stop();
  const pending = src.read();
  await new Promise((r) => setImmediate(r));
  s.configure({ enabled: true, clientId: 'cid', refreshToken: '' }); // logout
  release();
  await pending;
  assert.deepEqual(tokens, []);
  assert.equal(s.cfg.refreshToken, '');
  assert.equal(s.configure({ enabled: true, clientId: 'cid', refreshToken: 'NEW' }), true, 'a new login still reconnects');
  s.stop();
});

test('Service: the last time music played is remembered, a revoked login stops polling', async () => {
  let state = PLAYER;
  const s = service({ read: async () => normalizePlayback(state), close() {} });
  await s.poll(1000);
  assert.equal(s.data.lastPlayingAt, 1000);
  assert.equal(s.data.connected, true);
  state = { ...PLAYER, is_playing: false };
  assert.equal(await s.poll(5000), 6000, 'paused: slower polling');
  assert.equal(s.data.lastPlayingAt, 1000);
  state = null;
  assert.equal(await s.poll(9000), 10000);
  const statuses = [];
  const dead = service({ read: async () => { throw Object.assign(new Error('abgelaufen'), { fatal: true }); }, close() {} });
  dead.on('status', () => statuses.push(dead.status()));
  assert.equal(await dead.poll(), null);
  assert.equal(dead.data.connected, false);
  assert.equal(await dead.poll(), null, 'no more requests until a new login');
  assert.equal(statuses.length, 1);
});

test('Service: configuration changes only reconnect for another account; demo mode', () => {
  const s = new SpotifyService();
  assert.equal(s.status().enabled, false);
  assert.equal(s.configure({ enabled: true, clientId: 'cid' }), true);
  assert.equal(s.status().enabled, true, 'page exists before the login');
  assert.match(s.data.error, /Noch nicht mit Spotify verbunden/);
  assert.equal(s.source, null);
  assert.equal(s.configure({ enabled: true, clientId: 'cid', refreshToken: 'rt', account: 'Alex' }), true);
  assert.ok(s.source instanceof SpotifyWebSource);
  assert.equal(s.configure({ enabled: true, clientId: 'cid', refreshToken: 'rt', account: 'Alex', pauseMinutes: 9 }), false);
  assert.equal(s.data.account, 'Alex');
  s.stop();
  const demo = new SpotifyService();
  demo.configure({}, { demo: true });
  demo.stop();
  assert.ok(demo.status().demo);
  assert.equal(demo.status().account, 'Demo');
});

test('Login: state is checked, the code is exchanged with verifier and redirect URI', async () => {
  const { fetchImpl, calls } = fakeSpotify({
    'POST /api/token': () => json(200, { access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }),
    'GET /v1/me': () => json(200, { id: 'alex', display_name: 'Alex' }),
  });
  const s = new SpotifyService({ fetchImpl });
  assert.throws(() => s.startLogin('', 'https://x'), /Client-ID/);
  assert.throws(() => s.startLogin('cid', 'ftp://x'), /Ungültige Adresse/);
  const url = new URL(s.startLogin('cid', 'https://192.168.1.5:8095'));
  const state = url.searchParams.get('state');
  const login = await s.finishLogin({ code: 'CODE', state });
  assert.deepEqual(login, { refreshToken: 'RT', account: 'Alex', clientId: 'cid' });
  const form = new URLSearchParams(calls[0].body);
  assert.equal(form.get('grant_type'), 'authorization_code');
  assert.equal(form.get('code'), 'CODE');
  assert.equal(form.get('redirect_uri'), 'https://192.168.1.5:8095/api/spotify/callback');
  assert.equal(crypto.createHash('sha256').update(form.get('code_verifier')).digest('base64url'), url.searchParams.get('code_challenge'));
  await assert.rejects(s.finishLogin({ code: 'CODE', state }), /abgelaufen/, 'a state is valid once');
  const denied = new URL(s.startLogin('cid', 'https://h')).searchParams.get('state');
  await assert.rejects(s.finishLogin({ error: 'access_denied', state: denied }), /abgelehnt/);
  const old = new URL(s.startLogin('cid', 'https://h', 0)).searchParams.get('state');
  await assert.rejects(s.finishLogin({ code: 'x', state: old }, 11 * 60000), /abgelaufen/);
});

// what Node's fetch throws when no answer arrives (the reason is only in `cause`)
const fetchFailed = (code, message = `connect ${code}`) => new TypeError('fetch failed', { cause: Object.assign(new Error(message), { code }) });

test('network errors name the reason instead of "fetch failed"', () => {
  const host = 'accounts.spotify.com';
  assert.match(networkMessage(fetchFailed('EAI_AGAIN', `getaddrinfo EAI_AGAIN ${host}`), host), /accounts\.spotify\.com lässt sich nicht auflösen \(EAI_AGAIN\).*DNS/);
  const both = new TypeError('fetch failed', { cause: Object.assign(new AggregateError([Object.assign(new Error('connect ECONNREFUSED ::1:443'), { code: 'ECONNREFUSED' })], ''), { code: 'ECONNREFUSED' }) });
  assert.match(networkMessage(both, host), /keine Verbindung zu accounts\.spotify\.com \(ECONNREFUSED\).*Internetzugang/);
  const listOnly = new TypeError('fetch failed', { cause: new AggregateError([new Error('x'), Object.assign(new Error('connect ENETUNREACH'), { code: 'ENETUNREACH' })], '') });
  assert.match(networkMessage(listOnly, host), /\(ENETUNREACH\)/, 'code of the addresses tried');
  assert.match(networkMessage(fetchFailed('UND_ERR_CONNECT_TIMEOUT', 'Connect Timeout Error'), host), /keine Verbindung.*UND_ERR_CONNECT_TIMEOUT/);
  assert.match(networkMessage(fetchFailed('UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'unable to get local issuer certificate'), host), /Zertifikat von accounts\.spotify\.com nicht akzeptiert.*Uhrzeit/);
  assert.match(networkMessage(fetchFailed('ECONNRESET', 'read ECONNRESET'), host), /Verbindung zu accounts\.spotify\.com abgebrochen \(ECONNRESET\)/);
  assert.match(networkMessage(new DOMException('The operation was aborted due to timeout', 'TimeoutError'), host), /antwortet nicht \(Zeitüberschreitung\)/);
  assert.equal(networkMessage(new TypeError('fetch failed', { cause: new Error('bad port') }), host), 'Spotify nicht erreichbar: accounts.spotify.com: bad port.');
  assert.doesNotMatch(networkMessage(fetchFailed('EAI_AGAIN'), host), /fetch failed/);
});

test('spotifyFetch: one more try when the connection failed, none for other errors; a timeout per request', async () => {
  let n = 0;
  const signals = [];
  const flaky = async (_url, init) => {
    signals.push(init.signal);
    if (n++ === 0) throw fetchFailed('EAI_AGAIN');
    return json(200, { ok: true });
  };
  const res = await spotifyFetch(flaky, 'https://accounts.spotify.com/api/token', { method: 'POST' }, { retryDelay: 0 });
  assert.equal(res.status, 200);
  assert.equal(n, 2);
  assert.ok(signals.every((s) => s instanceof AbortSignal) && signals[0] !== signals[1], 'each attempt has its own timeout');

  n = 0;
  const down = async () => {
    n++;
    throw fetchFailed('ECONNREFUSED');
  };
  await assert.rejects(spotifyFetch(down, new URL('https://api.spotify.com/v1/me'), {}, { retryDelay: 0 }), (e) =>
    e instanceof SpotifyError && e.status === 502 && /api\.spotify\.com \(ECONNREFUSED\)/.test(e.message) && e.cause?.cause?.code === 'ECONNREFUSED');
  assert.equal(n, 2, 'retried once only');

  n = 0;
  const reset = async () => {
    n++;
    throw fetchFailed('ECONNRESET');
  };
  await assert.rejects(spotifyFetch(reset, 'https://accounts.spotify.com/api/token', {}, { retryDelay: 0 }), /abgebrochen/);
  assert.equal(n, 1, 'the request may have arrived: not repeated');
});

test('Login: without an answer from Spotify the reason is reported; a missing account name does not stop it', async () => {
  const offline = new SpotifyService({ fetchImpl: async () => { throw fetchFailed('EAI_AGAIN', 'getaddrinfo EAI_AGAIN accounts.spotify.com'); }, retryDelay: 0 });
  const state = new URL(offline.startLogin('cid', 'https://192.168.1.5:8095')).searchParams.get('state');
  await assert.rejects(offline.finishLogin({ code: 'CODE', state }), (e) => /accounts\.spotify\.com lässt sich nicht auflösen \(EAI_AGAIN\)/.test(e.message) && !/fetch failed/.test(e.message));

  const noProfile = new SpotifyService({
    fetchImpl: async (url) => {
      if (new URL(url).pathname === '/api/token') return json(200, { access_token: 'AT', refresh_token: 'RT', expires_in: 3600 });
      throw fetchFailed('ECONNRESET');
    },
    retryDelay: 0,
  });
  const st = new URL(noProfile.startLogin('cid', 'https://h')).searchParams.get('state');
  assert.deepEqual(await noProfile.finishLogin({ code: 'CODE', state: st }), { refreshToken: 'RT', account: '', clientId: 'cid' });
});

test('Web API client: a token renewal without an answer names the reason and is not fatal', async () => {
  const src = new SpotifyWebSource(sanitizeSpotify({ enabled: true, clientId: 'cid', refreshToken: 'RT' }), {
    fetchImpl: async () => { throw fetchFailed('UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'unable to get local issuer certificate'); },
    retryDelay: 0,
  });
  await assert.rejects(src.read(), (e) => e.status === 502 && !e.fatal && /Zertifikat von accounts\.spotify\.com/.test(e.message));
});

test('demo player: playback, controls, devices, search, playlists and queue', async () => {
  const t0 = 1_000_000;
  const demo = new DemoSpotifySource(t0);
  let st = await demo.read(t0);
  assert.equal(st.playing, true);
  assert.equal(st.track.name, 'Kaffee am Fenster');
  assert.equal(st.device.name, 'Verstärker Wohnzimmer');
  assert.equal((await demo.read(t0 + 10000)).progress, 57000);
  await demo.command({ action: 'pause' }, t0 + 10000);
  assert.equal((await demo.read(t0 + 60000)).progress, 57000, 'paused');
  await demo.command({ action: 'play' }, t0 + 60000);
  await demo.command({ action: 'next' }, t0 + 60000);
  st = await demo.read(t0 + 60000);
  assert.equal(st.track.name, 'Midnight Tram');
  assert.equal(st.progress, 0);
  // the track ends: the next one starts by itself
  st = await demo.read(t0 + 60000 + 251000 + 5000);
  assert.equal(st.track.name, 'Paper Planes Over Berlin');
  await demo.command({ action: 'repeat', state: 'track' });
  await demo.command({ action: 'shuffle', state: true });
  await demo.command({ action: 'volume', volume: 60 });
  await demo.command({ action: 'transfer', deviceId: 'demo-kitchen', play: true });
  st = await demo.read();
  assert.deepEqual([st.repeat, st.shuffle, st.device.volume, st.device.name], ['track', true, 60, 'Küche']);
  await assert.rejects(demo.command({ action: 'transfer', deviceId: 'nope', play: true }), (e) => e.status === 404);
  const found = await demo.search('lumen');
  assert.equal(found.tracks.length, 3);
  assert.equal(found.artists[0].name, 'Lumen Drive');
  const lists = await demo.playlists();
  await demo.command({ action: 'play', contextUri: lists[1].uri });
  st = await demo.read();
  assert.equal(st.track.name, 'Neon Horizon');
  assert.equal(st.context.uri, lists[1].uri);
  await demo.command({ action: 'queue', uri: 'spotify:track:demo9' });
  assert.equal((await demo.queue())[0].name, 'Herbstlicht');
  assert.ok((await demo.recent()).length > 0);
  assert.match(demoCoverSvg(3), /<svg[\s\S]*MT/);
  assert.match(demoCoverSvg('<script>'), /<svg/);
});
