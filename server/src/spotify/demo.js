/**
 * Simulated Spotify Connect player of the demo mode with an invented catalogue.
 */
import { SEARCH_LIMIT, SpotifyError, spotifyMessage } from './api.js';
import { ALL_ALLOWED } from './normalize.js';

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
    const albums = [...new Map(DEMO_TRACKS.filter((t) => hit(`${t.album} ${t.artists}`)).map((t) => [t.album, { id: t.albumUri, uri: t.albumUri, kind: 'album', name: t.album, subtitle: t.artists, image: t.image, total: null }])).values()];
    const artists = [...new Map(DEMO_TRACKS.filter((t) => hit(t.artists)).map((t) => [t.artists, { id: t.artists, uri: `spotify:artist:demo${t.artists.replace(/\W/g, '')}`, kind: 'artist', name: t.artists, subtitle: 'Künstler', image: t.image, total: null }])).values()];
    const playlists = DEMO_PLAYLISTS.filter((p) => hit(p.name)).map(({ tracks: _t, ...p }) => p);
    return { tracks: tracks.map((t) => ({ ...t })), albums, artists, playlists };
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
