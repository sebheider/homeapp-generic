/**
 * Spotify player: live position between two server reads, time formatting, the repeat cycle,
 * the rule when the mini player appears on the overview and the immediate effect of a command.
 */
import type { SpotifyCommand, SpotifyConfig, SpotifyRepeat, SpotifyState } from './types';

/** Repeat cycle of the button: off → whole list → this track → off. */
export const NEXT_REPEAT: Record<SpotifyRepeat, SpotifyRepeat> = { off: 'context', context: 'track', track: 'off' };
export const REPEAT_LABEL: Record<SpotifyRepeat, string> = { off: 'Wiederholen aus', context: 'Wiederholen: alle', track: 'Wiederholen: dieser Titel' };

/** Position in ms: the read position plus the time since it was received while playing, at most the track length. */
export function livePosition(s: Pick<SpotifyState, 'progress' | 'playing' | 'receivedAt' | 'track'> | null | undefined, now = Date.now()): number {
  if (!s) return 0;
  const pos = s.progress + (s.playing && s.receivedAt != null ? Math.max(0, now - s.receivedAt) : 0);
  return s.track?.duration ? Math.min(pos, s.track.duration) : pos;
}

/** "3:05" or "1:02:03". */
export function mmss(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '0:00';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Device names are compared without case and surrounding spaces. */
export const sameDevice = (a: string | null | undefined, b: string | null | undefined) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

/**
 * Whether the overview shows the mini player: music plays (or was paused less than `pauseMinutes`
 * ago, so it can be resumed from there) – if a device is chosen and restricted, only on that device.
 */
export function showOnDashboard(
  s: Pick<SpotifyState, 'enabled' | 'connected' | 'active' | 'track' | 'playing' | 'device' | 'lastPlayingAt'> | null | undefined,
  cfg: Pick<SpotifyConfig, 'dashboard' | 'device' | 'onlyDevice' | 'pauseMinutes'> | null | undefined,
  now = Date.now(),
): boolean {
  if (!s?.enabled || !s.connected || !s.active || !s.track) return false;
  if (cfg?.dashboard === false) return false;
  if (cfg?.device && cfg.onlyDevice !== false && !sameDevice(s.device?.name, cfg.device)) return false;
  if (s.playing) return true;
  const grace = (cfg?.pauseMinutes ?? 5) * 60000;
  return grace > 0 && s.lastPlayingAt > 0 && now - s.lastPlayingAt < grace;
}

/** State right after a command, shown until the server confirms it (the position is frozen at `now`). */
export function applyCommand(s: SpotifyState, cmd: SpotifyCommand, now = Date.now()): SpotifyState {
  const at = { progress: livePosition(s, now), receivedAt: now };
  switch (cmd.action) {
    case 'play':
      return { ...s, ...at, ...(cmd.uris || cmd.contextUri ? { progress: 0 } : {}), playing: true, lastPlayingAt: now };
    case 'pause':
      return { ...s, ...at, playing: false, lastPlayingAt: now };
    case 'next':
    case 'previous':
      return { ...s, progress: 0, receivedAt: now };
    case 'seek':
      return { ...s, progress: cmd.position, receivedAt: now };
    case 'volume':
      return s.device ? { ...s, device: { ...s.device, volume: cmd.volume } } : s;
    case 'shuffle':
      return { ...s, shuffle: cmd.state };
    case 'repeat':
      return { ...s, repeat: cmd.state };
    default:
      return s;
  }
}
