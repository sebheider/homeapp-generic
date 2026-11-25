/**
 * Spotify page: the current track with large cover and all controls (shuffle, previous, play / pause,
 * next, repeat, position, volume) and the device to play on (e.g. the amplifier); below it "Als
 * Nächstes" and "Zuletzt gehört" side by side, each scrolling on its own; a search for tracks, albums,
 * artists and playlists (beside the player on wide screens) and, at the bottom, the own playlists as
 * a list that has to be opened first. Everything runs through the server (see server spotify.js); the
 * cover images come from Spotify's CDN.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, CloudOff, History, ListMusic, ListPlus, Music, Play, RotateCw, Search, X } from 'lucide-react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { mmss, sameDevice } from '../lib/spotify';
import type { SpotifyCollection, SpotifyDevice, SpotifySearchResult, SpotifyState, SpotifyTrack } from '../lib/types';
import { DeviceIcon, Equalizer, SPOTIFY_GREEN, SpotifyControls, SpotifyCover, SpotifyProgress, SpotifyVolume } from '../components/Spotify';
import { toneStyle } from '../components/Hud';
import { Empty, Loading, OpenSettingsButton, PageHeader, Panel } from '../components/ui';

/** Loads data with `fn` whenever one of `deps` changes; `reload` loads again. */
function useLoad<T>(fn: () => Promise<T>, deps: unknown[], enabled = true) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fn().then((d) => alive && (setData(d), setError(null))).catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [...deps, n, enabled]);
  return { data, error, reload: () => setN((x) => x + 1) };
}

/** Choice of the device to play on; switching hands the running playback over. */
function DevicePicker({ s }: { s: SpotifyState }) {
  const preferred = useStore((x) => x.config?.spotify.device ?? '');
  const cmd = useStore((x) => x.spotifyCommand);
  const { data: devices, error, reload } = useLoad(() => api.spotifyDevices(), [s.device?.id]);
  const list: SpotifyDevice[] = devices ?? [];
  const current = s.device?.id && list.some((d) => d.id === s.device!.id) ? s.device.id : '';
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted hidden sm:inline-flex"><DeviceIcon type={s.device?.type} size={16} /></span>
      <select
        className="field !py-2 !w-auto max-w-[16rem]"
        aria-label="Wiedergabegerät"
        value={current}
        onFocus={reload}
        onChange={(e) => e.target.value && cmd({ action: 'transfer', deviceId: e.target.value, play: s.playing || !s.active })}
      >
        <option value="" disabled>{list.length ? 'Gerät wählen …' : error ? 'Geräte nicht abrufbar' : 'Keine Geräte gefunden'}</option>
        {list.map((d) => (
          <option key={d.id} value={d.id} disabled={d.restricted}>
            {d.name}{sameDevice(d.name, preferred) ? ' ★' : ''}{d.restricted ? ' (gesperrt)' : ''}
          </option>
        ))}
      </select>
      <button className="btn btn-icon" onClick={reload} aria-label="Geräte neu laden" title="Geräte neu laden"><RotateCw size={15} /></button>
    </div>
  );
}

/** Large player: cover, title, position, controls and volume. */
function NowPlaying({ s }: { s: SpotifyState }) {
  if (!s.track) {
    return (
      <Panel title="Wiedergabe">
        <div className="flex flex-col items-center text-center gap-3 py-6">
          <div className="icon-bubble !w-16 !h-16 !rounded-2xl" style={toneStyle(SPOTIFY_GREEN)}><Music size={28} /></div>
          <p className="font-semibold">Gerade läuft nichts</p>
          <p className="text-sm text-muted max-w-sm">Wähle oben ein Gerät und starte eine Playlist, ein Album oder einen Titel aus der Suche.</p>
        </div>
      </Panel>
    );
  }
  return (
    // own container: the cover only moves next to the text when the panel itself is wide enough
    // (container queries measure in the scaled rem of the kiosk mode, media queries in real pixels).
    // The text column needs about 17.5rem for the controls: large cover from 34rem, smaller from 29rem.
    <section className="glass p-4 sm:p-6 @container" style={toneStyle(SPOTIFY_GREEN)}>
      <div className="grid gap-5 items-center @min-[29rem]:grid-cols-[minmax(0,10rem)_minmax(0,1fr)] @min-[34rem]:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <SpotifyCover track={s.track} className="w-full max-w-[15rem] mx-auto aspect-square rounded-2xl shadow-2xl" />
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted">
            <Equalizer playing={s.playing} />
            {s.playing ? 'Läuft gerade' : 'Pausiert'}
            {s.device && <span className="normal-case tracking-normal inline-flex items-center gap-1 ml-auto"><DeviceIcon type={s.device.type} size={13} /> {s.device.name}</span>}
          </div>
          <h2 className="text-2xl font-bold leading-tight mt-2 break-words">{s.track.name}</h2>
          <p className="text-muted mt-1 break-words">{s.track.artists}{s.track.album ? ` · ${s.track.album}` : ''}</p>
          <SpotifyProgress s={s} className="mt-4" />
          <SpotifyControls s={s} size="lg" className="mt-2" />
          <SpotifyVolume s={s} className="mt-3 max-w-sm mx-auto" />
        </div>
      </div>
    </section>
  );
}

/** One track: cover, title, artists and length; a tap plays it, „+“ adds it to the queue. */
function TrackRow({ t, current, onPlay, onQueued }: { t: SpotifyTrack; current: boolean; onPlay: () => void; onQueued?: () => void }) {
  const cmd = useStore((x) => x.spotifyCommand);
  const toast = useStore((x) => x.toast);
  const queue = async () => {
    if (!(await cmd({ action: 'queue', uri: t.uri }))) return;
    toast(`„${t.name}“ kommt als Nächstes`, 'success');
    onQueued?.();
  };
  return (
    <div className={`group flex items-center gap-3 px-2 py-1.5 rounded-xl hover:bg-[var(--card-hover)] transition-colors ${current ? 'bg-[var(--card-hover)]' : ''}`}>
      <button className="flex items-center gap-3 min-w-0 flex-1 text-left" onClick={onPlay} aria-label={`${t.name} abspielen`}>
        <span className="relative shrink-0">
          <SpotifyCover track={t} small className="w-10 h-10 rounded-md" />
          <span className="absolute inset-0 grid place-items-center rounded-md bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"><Play size={16} fill="currentColor" /></span>
        </span>
        <span className="min-w-0">
          <span className={`block truncate font-medium ${current ? 'text-[#1ed760]' : ''}`}>{t.name}</span>
          <span className="block truncate text-xs text-muted">{t.artists}</span>
        </span>
      </button>
      <span className="text-xs text-muted tabular-nums hidden sm:block">{mmss(t.duration)}</span>
      <button
        className="sp-btn w-8 h-8"
        aria-label={`${t.name} zur Warteschlange hinzufügen`}
        title="Zur Warteschlange hinzufügen"
        onClick={queue}
      >
        <ListPlus size={17} />
      </button>
    </div>
  );
}

/** List of tracks; a tap plays the track and the ones after it. */
function TrackList({ tracks, current, onQueued }: { tracks: SpotifyTrack[]; current?: string | null; onQueued?: () => void }) {
  const cmd = useStore((x) => x.spotifyCommand);
  return (
    <div className="flex flex-col">
      {tracks.map((t, i) => (
        <TrackRow key={`${t.uri}-${i}`} t={t} current={t.uri === current} onQueued={onQueued} onPlay={() => cmd({ action: 'play', uris: tracks.slice(i, i + 50).map((x) => x.uri) })} />
      ))}
    </div>
  );
}

/**
 * Album, artist or playlist as a row: cover, name, owner / artist and number of tracks; a tap plays it.
 * The one that is playing right now is marked. Two columns when the page is wide enough.
 */
function CollectionList({ items, current }: { items: SpotifyCollection[]; current?: string | null }) {
  const cmd = useStore((x) => x.spotifyCommand);
  const playing = useStore((x) => Boolean(x.spotify?.playing));
  return (
    <ul className="grid gap-1 @3xl:grid-cols-2 @3xl:gap-x-4">
      {items.map((c) => {
        const active = c.uri === current;
        return (
          <li key={c.uri} className="min-w-0">
            <button
              className={`group w-full flex items-center gap-3 px-2 py-1.5 rounded-xl text-left hover:bg-[var(--card-hover)] transition-colors ${active ? 'bg-[var(--card-hover)]' : ''}`}
              onClick={() => cmd({ action: 'play', contextUri: c.uri })}
              aria-label={`${c.name} abspielen`}
            >
              <SpotifyCover track={c} className={`w-12 h-12 shrink-0 ${c.kind === 'artist' ? 'rounded-full' : 'rounded-lg'}`} />
              <span className="min-w-0 flex-1">
                <span className={`flex items-center gap-2 font-medium ${active ? 'text-[#1ed760]' : ''}`}>
                  {active && <Equalizer playing={playing} className="shrink-0" />}
                  <span className="truncate">{c.name}</span>
                </span>
                <span className="block truncate text-xs text-muted">{[c.subtitle, c.total != null ? `${c.total} Titel` : null].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="w-9 h-9 shrink-0 rounded-full grid place-items-center text-black opacity-70 group-hover:opacity-100 transition-opacity" style={{ background: SPOTIFY_GREEN }} aria-hidden>
                <Play size={16} fill="currentColor" className="translate-x-[1px]" />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Panel whose list scrolls on its own (fixed maximum height), so long lists do not stretch the page. */
function ScrollPanel({ title, right, children }: { title: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <Panel title={title} right={right} className="h-full flex flex-col min-w-0">
      <div className="sp-scroll -mx-2 px-2 max-h-[21rem] min-h-[6rem]">{children}</div>
    </Panel>
  );
}

/** The own playlists at the bottom of the page: closed at first, loaded when opened. */
function PlaylistsPanel({ current }: { current?: string | null }) {
  const [open, setOpen] = useState(false);
  const playlists = useLoad(() => api.spotifyPlaylists(), [], open);
  const count = playlists.data?.length;
  return (
    <section className="glass p-4 sm:p-5">
      <h2 className="section-title">
        <button className="w-full flex items-center gap-2 text-left rounded-lg uppercase" aria-expanded={open} aria-controls="spotify-playlists" onClick={() => setOpen(!open)}>
          <ListMusic size={14} className="shrink-0" />
          <span className="flex-1">Meine Playlists</span>
          {count != null && <span className="normal-case tracking-normal font-normal text-xs text-muted">{count} {count === 1 ? 'Playlist' : 'Playlists'}</span>}
          <ChevronDown size={18} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </h2>
      {open && (
        <div id="spotify-playlists" className="mt-3">
          {playlists.error ? (
            <p className="text-sm text-muted">{playlists.error}</p>
          ) : !playlists.data ? (
            <Loading className="h-24" />
          ) : playlists.data.length ? (
            <CollectionList items={playlists.data} current={current} />
          ) : (
            <p className="text-sm text-muted">Keine Playlists.</p>
          )}
        </div>
      )}
    </section>
  );
}

type Tab = 'tracks' | 'albums' | 'artists' | 'playlists';
const TABS: { id: Tab; label: string }[] = [
  { id: 'tracks', label: 'Titel' },
  { id: 'albums', label: 'Alben' },
  { id: 'artists', label: 'Künstler' },
  { id: 'playlists', label: 'Playlists' },
];

/** Search box with results by kind (Spotify returns at most 10 per kind). */
function SearchPanel({ s, onQueued }: { s: SpotifyState; onQueued?: () => void }) {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>('tracks');
  const [result, setResult] = useState<SpotifySearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setResult(null);
      setError(null);
      return;
    }
    const n = ++seq.current;
    const t = window.setTimeout(() => {
      setBusy(true);
      api.spotifySearch(query)
        .then((r) => n === seq.current && (setResult(r), setError(null)))
        .catch((e: Error) => n === seq.current && setError(e.message))
        .finally(() => n === seq.current && setBusy(false));
    }, 350);
    return () => clearTimeout(t);
  }, [q]);
  const items = result?.[tab] ?? [];
  return (
    <Panel title="Suche">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-3 text-muted pointer-events-none" />
        <input className="field sp-search !pl-9 !pr-11" type="search" placeholder="Titel, Künstler, Alben oder Playlists" aria-label="Spotify durchsuchen" value={q} onChange={(e) => setQ(e.target.value)} />
        {/* the wrapper positions the button: `.sp-btn` itself is position: relative */}
        {q && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2">
            <button className="sp-btn w-8 h-8" onClick={() => setQ('')} aria-label="Suche leeren"><X size={15} /></button>
          </span>
        )}
      </div>
      {q.trim() && (
        <>
          <div className="flex flex-wrap gap-2 mt-3" role="tablist" aria-label="Ergebnisart">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className={`chip ${tab === t.id ? 'on' : ''}`} style={toneStyle(SPOTIFY_GREEN)} onClick={() => setTab(t.id)}>
                {t.label}{result ? ` ${result[t.id].length}` : ''}
              </button>
            ))}
          </div>
          <div className="mt-3 sp-scroll -mx-2 px-2 max-h-[26rem]">
            {error ? (
              <p className="text-sm text-rose-400">{error}</p>
            ) : !result ? (
              <Loading className="h-24" />
            ) : !items.length ? (
              <p className="text-sm text-muted">{busy ? 'Sucht …' : 'Nichts gefunden.'}</p>
            ) : tab === 'tracks' ? (
              <TrackList tracks={result.tracks} current={s.track?.uri} onQueued={onQueued} />
            ) : (
              <CollectionList items={items as SpotifyCollection[]} current={s.context?.uri} />
            )}
          </div>
        </>
      )}
    </Panel>
  );
}

/** Spotify page. */
export function SpotifyView() {
  const s = useStore((x) => x.spotify);
  const ready = Boolean(s?.enabled && (s.connected || s.demo));
  const trackUri = s?.track?.uri ?? null;
  const queue = useLoad(() => api.spotifyQueue(), [trackUri], ready);
  const recent = useLoad(() => api.spotifyRecent(), [trackUri], ready);

  if (!s?.enabled) {
    return (
      <div>
        <PageHeader title="Spotify" />
        <Empty icon={<Music size={28} />} title="Spotify ist nicht eingerichtet" text="Verbinde dein Spotify-Konto unter Einstellungen → Spotify, dann steuerst du hier die Musik auf deinem Verstärker.">
          <OpenSettingsButton />
        </Empty>
      </div>
    );
  }
  if (!ready) {
    return (
      <div>
        <PageHeader title="Spotify" />
        <Empty icon={<CloudOff size={28} />} title="Spotify nicht verbunden" text={s.error ?? 'Verbindet …'}>
          <OpenSettingsButton />
        </Empty>
      </div>
    );
  }

  const subtitle = [s.demo ? 'Demo-Player' : s.account ? `Konto: ${s.account}` : null, s.error].filter(Boolean).join(' · ');
  // The layout follows the width of the page itself (container queries measure in the scaled rem of
  // the kiosk mode, `lg:` media queries would use real pixels):
  //   wide:   player | search, below "Als Nächstes" | "Zuletzt gehört", playlists at the bottom
  //   narrow: player, "Als Nächstes" | "Zuletzt gehört" (one below the other on phones), search, playlists
  const queued = () => window.setTimeout(queue.reload, 600);
  return (
    <div className="@container">
      <PageHeader title="Spotify" subtitle={subtitle || undefined}>
        <DevicePicker s={s} />
      </PageHeader>
      <div className="grid gap-4 items-start @5xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="min-w-0">
          <NowPlaying s={s} />
        </div>
        <div className="min-w-0 order-1 @5xl:order-none">
          <SearchPanel s={s} onQueued={queued} />
        </div>
        <div className="grid gap-4 items-stretch @2xl:grid-cols-2 @5xl:col-span-2">
          <ScrollPanel
            title={<span className="inline-flex items-center gap-1.5"><ListMusic size={14} /> Als Nächstes</span>}
            right={queue.data?.length ? <span className="text-xs text-muted">{queue.data.length} Titel</span> : undefined}
          >
            {queue.error ? <p className="text-sm text-muted">{queue.error}</p> : queue.data?.length ? <TrackList tracks={queue.data} onQueued={queued} /> : <p className="text-sm text-muted">Die Warteschlange ist leer.</p>}
          </ScrollPanel>
          <ScrollPanel title={<span className="inline-flex items-center gap-1.5"><History size={14} /> Zuletzt gehört</span>}>
            {recent.error ? <p className="text-sm text-muted">{recent.error}</p> : recent.data?.length ? <TrackList tracks={recent.data} current={trackUri} onQueued={queued} /> : <p className="text-sm text-muted">Noch nichts.</p>}
          </ScrollPanel>
        </div>
        <div className="min-w-0 order-2 @5xl:order-none @5xl:col-span-2">
          <PlaylistsPanel current={s.context?.uri} />
        </div>
      </div>
    </div>
  );
}
