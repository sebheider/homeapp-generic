/**
 * Control commands from the browser: validation and the effect shown until the next poll confirms it.
 */
import { clampNumber } from '../util/number.js';
import { trimText } from '../util/text.js';
import { SpotifyError } from './api.js';
import { REPEAT_MODES } from './normalize.js';

const URI = /^spotify:[a-z]+(?::[A-Za-z0-9._-]+)+$/;

/** Validates a control command from the browser; throws a 400 error for anything unknown. */
export function sanitizeCommand(action, p = {}) {
  const bad = () => new SpotifyError(400, 'Ungültiger Befehl');
  const deviceId = p.deviceId == null || p.deviceId === '' ? null : trimText(p.deviceId, 100);
  const uri = (v) => {
    const u = trimText(v, 200);
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
      return { action, position: Math.round(clampNumber(p.position, 0, 24 * 3600e3, 0)) };
    case 'volume':
      if (!Number.isFinite(Number(p.volume))) throw bad();
      return { action, volume: Math.round(clampNumber(p.volume, 0, 100, 0)) };
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
