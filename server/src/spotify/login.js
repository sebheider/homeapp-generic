/**
 * Spotify login: authorization code flow with PKCE (only the client id of the own Spotify app is needed).
 */
import crypto from 'node:crypto';
import { ACCOUNTS } from './api.js';

/** Everything the player page needs: read and control playback, the own playlists, recently played. */
export const SPOTIFY_SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-recently-played',
].join(' ');

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
