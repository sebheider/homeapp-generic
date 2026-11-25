/**
 * Spotify player components: cover, equaliser (shows that music plays), the controls (shuffle,
 * previous, play / pause, next, repeat), a seekable progress bar with live position, the volume
 * slider, device icons and the mini player of the overview (HUD panel, kiosk strip). The mini
 * player only appears while music plays – and a few minutes after pausing, so it can be resumed.
 */
import { useEffect, useRef, useState, type MouseEvent, type KeyboardEvent } from 'react';
import { Laptop, MonitorSpeaker, Music, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Smartphone, Speaker, Tv, Volume1, Volume2, VolumeX } from 'lucide-react';
import { useStore } from '../lib/store';
import { useNow } from '../lib/hooks';
import { clamp } from '../lib/format';
import { NEXT_REPEAT, REPEAT_LABEL, livePosition, mmss, showOnDashboard } from '../lib/spotify';
import type { SpotifyState } from '../lib/types';
import { HudPanel } from './Hud';
import { Slider } from './ui';

/** Accent colour of the Spotify components. */
export const SPOTIFY_GREEN = '#1ed760';

const stop = (e: MouseEvent) => e.stopPropagation();

/**
 * True while the overview shows the mini player (see `showOnDashboard`). After pausing it re-renders
 * exactly when the waiting time is over, so the player disappears without a regular timer.
 */
export function useSpotifyOnDashboard() {
  const [, tick] = useState(0);
  const show = useStore((s) => showOnDashboard(s.spotify, s.config?.spotify));
  const until = useStore((s) => (s.spotify && !s.spotify.playing && s.spotify.lastPlayingAt ? s.spotify.lastPlayingAt + (s.config?.spotify.pauseMinutes ?? 5) * 60000 : 0));
  useEffect(() => {
    if (!show || !until) return;
    const t = window.setTimeout(() => tick((n) => n + 1), Math.max(0, until - Date.now()) + 50);
    return () => clearTimeout(t);
  }, [show, until]);
  return show;
}

/** Album cover (or a note symbol); `small` uses the small image. */
export function SpotifyCover({ track, small = false, className = '' }: { track: { image?: string | null; imageSmall?: string | null } | null | undefined; small?: boolean; className?: string }) {
  const src = small ? track?.imageSmall ?? track?.image : track?.image ?? track?.imageSmall;
  if (!src) return <div className={`grid place-items-center bg-[var(--track)] text-muted ${className}`}><Music size={18} /></div>;
  return <img src={src} alt="" className={`object-cover bg-black/30 ${className}`} draggable={false} loading="lazy" />;
}

/** Three bars that dance while music plays. */
export function Equalizer({ playing, className = '' }: { playing: boolean; className?: string }) {
  return (
    <span className={`sp-eq ${playing ? '' : 'paused'} ${className}`} aria-hidden>
      <i />
      <i />
      <i />
    </span>
  );
}

/** Symbol of a Spotify Connect device type. */
export function DeviceIcon({ type, size = 14 }: { type: string | null | undefined; size?: number }) {
  const t = String(type ?? '').toLowerCase();
  const Icon = t === 'smartphone' || t === 'tablet' ? Smartphone : t === 'computer' ? Laptop : t === 'tv' || t === 'castvideo' ? Tv : t === 'avr' || t === 'stb' || t === 'audiodongle' ? MonitorSpeaker : Speaker;
  return <Icon size={size} />;
}

const SIZES = { sm: { btn: 'w-8 h-8', play: 'w-9 h-9', icon: 16, playIcon: 17 }, md: { btn: 'w-10 h-10', play: 'w-12 h-12', icon: 19, playIcon: 22 }, lg: { btn: 'w-12 h-12', play: 'w-16 h-16', icon: 22, playIcon: 28 } };

/** Shuffle, previous, play / pause, next and repeat (the active switches light up green). */
export function SpotifyControls({ s, size = 'md', className = '' }: { s: SpotifyState; size?: keyof typeof SIZES; className?: string }) {
  const cmd = useStore((x) => x.spotifyCommand);
  const z = SIZES[size];
  return (
    <div className={`flex items-center justify-center gap-1 ${className}`} onClick={stop}>
      <button className={`sp-btn ${z.btn} ${s.shuffle ? 'on' : ''}`} disabled={!s.can.shuffle} aria-pressed={s.shuffle} aria-label="Zufallswiedergabe" title={s.shuffle ? 'Zufallswiedergabe an' : 'Zufallswiedergabe aus'} onClick={() => cmd({ action: 'shuffle', state: !s.shuffle })}>
        <Shuffle size={z.icon} />
      </button>
      <button className={`sp-btn ${z.btn}`} disabled={!s.can.previous} aria-label="Vorheriger Titel" title="Vorheriger Titel" onClick={() => cmd({ action: 'previous' })}>
        <SkipBack size={z.icon} fill="currentColor" />
      </button>
      <button className={`sp-btn sp-play ${z.play}`} aria-label={s.playing ? 'Pause' : 'Wiedergabe fortsetzen'} title={s.playing ? 'Pause' : 'Fortsetzen'} onClick={() => cmd(s.playing ? { action: 'pause' } : { action: 'play' })}>
        {s.playing ? <Pause size={z.playIcon} fill="currentColor" /> : <Play size={z.playIcon} fill="currentColor" className="translate-x-[1px]" />}
      </button>
      <button className={`sp-btn ${z.btn}`} disabled={!s.can.next} aria-label="Nächster Titel" title="Nächster Titel" onClick={() => cmd({ action: 'next' })}>
        <SkipForward size={z.icon} fill="currentColor" />
      </button>
      <button className={`sp-btn ${z.btn} ${s.repeat !== 'off' ? 'on' : ''}`} disabled={!s.can.repeat} aria-pressed={s.repeat !== 'off'} aria-label={REPEAT_LABEL[s.repeat]} title={REPEAT_LABEL[s.repeat]} onClick={() => cmd({ action: 'repeat', state: NEXT_REPEAT[s.repeat] })}>
        {s.repeat === 'track' ? <Repeat1 size={z.icon} /> : <Repeat size={z.icon} />}
      </button>
    </div>
  );
}

/**
 * Progress of the track with the live position (re-renders once a second only while playing).
 * A click / tap jumps to that position; arrow keys jump 10 seconds.
 */
export function SpotifyProgress({ s, compact = false, className = '' }: { s: SpotifyState; compact?: boolean; className?: string }) {
  const cmd = useStore((x) => x.spotifyCommand);
  const now = useNow(s.playing ? 1000 : 60000);
  const dur = s.track?.duration ?? 0;
  const pos = livePosition(s, now);
  const pct = dur ? clamp((pos / dur) * 100, 0, 100) : 0;
  const canSeek = s.can.seek && dur > 0;
  const seek = (ms: number) => canSeek && cmd({ action: 'seek', position: Math.round(clamp(ms, 0, dur - 500)) });
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    seek(((e.clientX - r.left) / r.width) * dur);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      seek(pos + (e.key === 'ArrowRight' ? 10000 : -10000));
    }
  };
  return (
    <div className={className}>
      <div
        className={`sp-bar ${canSeek ? 'cursor-pointer' : ''}`}
        role="slider"
        tabIndex={canSeek ? 0 : -1}
        aria-label="Position im Titel"
        aria-valuemin={0}
        aria-valuemax={Math.round(dur / 1000)}
        aria-valuenow={Math.round(pos / 1000)}
        aria-valuetext={`${mmss(pos)} von ${mmss(dur)}`}
        onClick={onClick}
        onKeyDown={onKey}
      >
        <i style={{ width: `${pct}%` }} />
      </div>
      {!compact && (
        <div className="flex justify-between text-[0.7rem] text-muted tabular-nums mt-1">
          <span>{mmss(pos)}</span>
          <span>{mmss(dur)}</span>
        </div>
      )}
    </div>
  );
}

/** Volume slider with mute button (devices without volume control show a hint instead). */
export function SpotifyVolume({ s, className = '' }: { s: SpotifyState; className?: string }) {
  const cmd = useStore((x) => x.spotifyCommand);
  const vol = s.device?.volume;
  const lastVolume = useRef(30);
  if (vol != null && vol > 0) lastVolume.current = vol;
  if (vol == null || s.device?.supportsVolume === false) {
    return <div className={`text-xs text-muted ${className}`}>Lautstärke nur am Gerät</div>;
  }
  const Icon = vol === 0 ? VolumeX : vol < 40 ? Volume1 : Volume2;
  return (
    <div className={`flex items-center gap-2 min-w-0 ${className}`} onClick={stop}>
      <button className="sp-btn w-8 h-8 shrink-0" aria-label={vol === 0 ? 'Ton wieder an' : 'Stummschalten'} title={vol === 0 ? 'Ton wieder an' : 'Stummschalten'} onClick={() => cmd({ action: 'volume', volume: vol === 0 ? lastVolume.current : 0 })}>
        <Icon size={18} />
      </button>
      <div className="flex-1 min-w-[4rem] sp-volume">
        <Slider value={vol} min={0} max={100} step={1} throttleMs={350} label="Lautstärke" onCommit={(v) => cmd({ action: 'volume', volume: v })} />
      </div>
      <span className="text-xs tabular-nums text-muted w-7 text-right shrink-0">{vol}</span>
    </div>
  );
}

/** Title line: equaliser, title and artists. */
function TrackTitle({ s, size = 'md' }: { s: SpotifyState; size?: 'sm' | 'md' }) {
  return (
    <div className="min-w-0">
      <div className={`font-semibold truncate flex items-center gap-2 ${size === 'sm' ? 'text-sm' : 'text-lg leading-tight'}`}>
        <Equalizer playing={s.playing} className="shrink-0" />
        <span className="truncate" title={s.track?.name}>{s.track?.name}</span>
      </div>
      <div className={`text-muted truncate ${size === 'sm' ? 'text-xs' : 'text-sm'}`} title={s.track?.artists}>{s.track?.artists}</div>
    </div>
  );
}

/** Mini player of the overview (standard design and widget of the own start page); a tap opens the Spotify page. */
export function SpotifyPanel({ className = '' }: { className?: string }) {
  const s = useStore((x) => x.spotify);
  const setView = useStore((x) => x.setView);
  if (!s?.track) return null;
  return (
    <HudPanel
      title={<span className="inline-flex items-center gap-1.5"><Music size={13} /> {s.playing ? 'Läuft gerade' : 'Pausiert'}</span>}
      color={SPOTIFY_GREEN}
      right={s.device && <span className="inline-flex items-center gap-1 min-w-0"><DeviceIcon type={s.device.type} size={12} /> <span className="truncate">{s.device.name}</span></span>}
      onClick={() => setView('spotify')}
      className={className}
    >
      <div className="flex items-center gap-4 min-w-0">
        <SpotifyCover track={s.track} className="w-20 h-20 rounded-xl shrink-0 shadow-lg" />
        <div className="min-w-0 flex-1">
          <TrackTitle s={s} />
          <SpotifyProgress s={s} className="mt-2" />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <SpotifyControls s={s} />
        <SpotifyVolume s={s} className="flex-1 min-w-[10rem]" />
      </div>
    </HudPanel>
  );
}

/** One-row mini player for the kiosk overview; `half`: next to the printer strip (without progress bar, shorter volume slider). */
export function SpotifyStrip({ half = false }: { half?: boolean }) {
  const s = useStore((x) => x.spotify);
  const setView = useStore((x) => x.setView);
  if (!s?.track) return null;
  return (
    <HudPanel color={SPOTIFY_GREEN} onClick={() => setView('spotify')} className="kiosk-spotify min-w-0">
      <div className="flex items-center gap-4 min-w-0">
        <SpotifyCover track={s.track} small className="w-10 h-10 rounded-lg shrink-0" />
        <div className={`min-w-0 ${half ? 'flex-1' : 'w-[13rem] shrink'}`}>
          <TrackTitle s={s} size="sm" />
        </div>
        {!half && <SpotifyProgress s={s} compact className="flex-1 min-w-[4rem]" />}
        <SpotifyControls s={s} size="sm" className="shrink-0" />
        <SpotifyVolume s={s} className={`${half ? 'w-32' : 'w-44'} shrink-0`} />
      </div>
    </HudPanel>
  );
}
