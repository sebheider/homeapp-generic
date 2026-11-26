/** Spotify Connect: configuration, playback state and player commands. */

/** Spotify Connect (see server spotify.js). The login (refresh token) never reaches the browser; `connected` tells whether one exists. */
export interface SpotifyConfig {
  enabled: boolean;
  /** Client id of the own app in the Spotify developer dashboard. */
  clientId: string;
  connected?: boolean;
  /** Display name of the connected Spotify account. */
  account: string;
  /** Name of the preferred device (e.g. the amplifier); empty = any. */
  device: string;
  /** Show the mini player on the overview only while this device plays. */
  onlyDevice: boolean;
  /** Mini player on the overview while music plays. */
  dashboard: boolean;
  /** Minutes the mini player stays after pausing (to resume). */
  pauseMinutes: number;
  pollSeconds: number;
}

/** Repeat mode of Spotify. */
export type SpotifyRepeat = 'off' | 'context' | 'track';

/** A track or podcast episode. */
export interface SpotifyTrack {
  id: string;
  uri: string;
  type: 'track' | 'episode';
  name: string;
  /** Artists (comma separated) or the podcast. */
  artists: string;
  album: string;
  albumUri: string | null;
  image: string | null;
  imageSmall: string | null;
  /** Milliseconds. */
  duration: number;
}

/** Album, artist or playlist that can be played as a whole. */
export interface SpotifyCollection {
  id: string;
  uri: string;
  kind: 'album' | 'artist' | 'playlist';
  name: string;
  subtitle: string;
  image: string | null;
  total: number | null;
}

/** A Spotify Connect device. */
export interface SpotifyDevice {
  id: string;
  name: string;
  type: string;
  active: boolean;
  restricted: boolean;
  volume: number | null;
  supportsVolume: boolean;
}

export interface SpotifySearchResult {
  tracks: SpotifyTrack[];
  albums: SpotifyCollection[];
  artists: SpotifyCollection[];
  playlists: SpotifyCollection[];
}

/** Playback state pushed by the server; `receivedAt` is set by the browser (base of the live position). */
export interface SpotifyState {
  /** Spotify is switched on (or the demo player runs). */
  enabled: boolean;
  demo: boolean;
  connected: boolean;
  error: string | null;
  account: string | null;
  /** A device has a playback session. */
  active: boolean;
  playing: boolean;
  device: { id: string | null; name: string; type: string; volume: number | null; supportsVolume: boolean } | null;
  track: SpotifyTrack | null;
  /** Position in ms when the state was read. */
  progress: number;
  shuffle: boolean;
  repeat: SpotifyRepeat;
  context: { uri: string; type: string } | null;
  can: { next: boolean; previous: boolean; seek: boolean; shuffle: boolean; repeat: boolean };
  /** Last time music was playing (server time, ms; 0 = not since the start). */
  lastPlayingAt: number;
  updatedAt: number;
  receivedAt?: number;
}

/** Control commands of the player (see server `sanitizeCommand`). */
export type SpotifyCommand =
  | { action: 'pause' | 'next' | 'previous' }
  | { action: 'play'; deviceId?: string; uris?: string[]; contextUri?: string; offsetUri?: string }
  | { action: 'seek'; position: number }
  | { action: 'volume'; volume: number }
  | { action: 'shuffle'; state: boolean }
  | { action: 'repeat'; state: SpotifyRepeat }
  | { action: 'transfer'; deviceId: string; play?: boolean }
  | { action: 'queue'; uri: string };
