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
 *
 * Modules (this file only re-exports their public API):
 *   spotify/config.js      `spotify` section of the configuration
 *   spotify/login.js       login with PKCE (consent page, redirect URI)
 *   spotify/api.js         addresses, errors, fetch with timeout and retry
 *   spotify/normalize.js   Web API answers in the form of the browser
 *   spotify/commands.js    validation of control commands and their optimistic effect
 *   spotify/web-source.js  SpotifyWebSource: player of a connected account
 *   spotify/demo.js        simulated player of the demo mode
 *   spotify/service.js     SpotifyService: polling, commands, login
 */
export { sanitizeSpotify } from './spotify/config.js';
export { SPOTIFY_SCOPES, authorizeUrl, pkcePair, redirectUriFor } from './spotify/login.js';
export { SpotifyError, networkCode, networkMessage, spotifyFetch, spotifyMessage } from './spotify/api.js';
export { REPEAT_MODES, findDevice, normalizeDevices, normalizeItem, normalizePlayback, normalizeSearch, pickImage } from './spotify/normalize.js';
export { optimistic, sanitizeCommand } from './spotify/commands.js';
export { SpotifyWebSource } from './spotify/web-source.js';
export { DemoSpotifySource, demoCoverSvg } from './spotify/demo.js';
export { SpotifyService } from './spotify/service.js';
