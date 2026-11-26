/**
 * Answers of the Web API in the form the browser uses: playback state, tracks, search results, devices.
 */
import { finiteOrNull } from '../util/number.js';
import { trimText } from '../util/text.js';

export const REPEAT_MODES = ['off', 'context', 'track'];

/** The objects of an array (Spotify sometimes sends `null` entries); [] for anything else. */
export const list = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);

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
    id: trimText(item.id, 100),
    uri: trimText(item.uri, 200),
    type: episode ? 'episode' : 'track',
    name: trimText(item.name, 200),
    artists: episode ? trimText(item.show?.name || item.show?.publisher, 200) : list(item.artists).map((a) => trimText(a.name, 100)).filter(Boolean).join(', '),
    album: episode ? '' : trimText(item.album?.name, 200),
    albumUri: !episode && item.album?.uri ? trimText(item.album.uri, 200) : null,
    image: pickImage(images, 300),
    imageSmall: pickImage(images, 64),
    duration: finiteOrNull(item.duration_ms) ?? 0,
  };
}

/** Every playback control allowed (nothing is playing, or the demo player). */
export const ALL_ALLOWED = { next: true, previous: true, seek: true, shuffle: true, repeat: true };

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
    device: dev ? { id: dev.id ? trimText(dev.id, 100) : null, name: trimText(dev.name, 100), type: trimText(dev.type, 40), volume: finiteOrNull(dev.volume_percent), supportsVolume: dev.supports_volume !== false } : null,
    track: normalizeItem(p.item),
    progress: finiteOrNull(p.progress_ms) ?? 0,
    shuffle: Boolean(p.shuffle_state),
    repeat: REPEAT_MODES.includes(p.repeat_state) ? p.repeat_state : 'off',
    context: p.context?.uri ? { uri: trimText(p.context.uri, 200), type: trimText(p.context.type, 20) } : null,
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
export function collection(kind, o, subtitle, total = null) {
  return { id: trimText(o.id, 100), uri: trimText(o.uri, 200), kind, name: trimText(o.name, 200), subtitle: trimText(subtitle, 200), image: pickImage(o.images, 300), total };
}

/** Search result: tracks, albums, artists and playlists (Spotify sometimes sends `null` entries). */
export function normalizeSearch(r) {
  const items = (k) => list(r?.[k]?.items).filter((x) => x.uri);
  return {
    tracks: items('tracks').map(normalizeItem).filter(Boolean),
    albums: items('albums').map((a) => collection('album', a, list(a.artists).map((x) => x.name).filter(Boolean).join(', '))),
    artists: items('artists').map((a) => collection('artist', a, (Array.isArray(a.genres) ? a.genres.filter((g) => typeof g === 'string') : []).slice(0, 2).join(', ') || 'Künstler')),
    playlists: items('playlists').map((p) => collection('playlist', p, p.owner?.display_name ?? '', finiteOrNull(p.items?.total ?? p.tracks?.total))),
  };
}

/** Devices from GET /me/player/devices. */
export function normalizeDevices(r) {
  return list(r?.devices).filter((d) => d.id).map((d) => ({
    id: trimText(d.id, 100),
    name: trimText(d.name, 100),
    type: trimText(d.type, 40),
    active: Boolean(d.is_active),
    restricted: Boolean(d.is_restricted),
    volume: finiteOrNull(d.volume_percent),
    supportsVolume: d.supports_volume !== false,
  }));
}

/** Device with the given name (case and surrounding spaces ignored). */
export const findDevice = (devices, name) => {
  const want = String(name || '').trim().toLowerCase();
  return want ? devices.find((d) => d.name.trim().toLowerCase() === want) ?? null : null;
};
