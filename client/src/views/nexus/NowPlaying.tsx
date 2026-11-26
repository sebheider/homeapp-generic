import { useStore } from '../../lib/store';
import { SpotifyControls, SpotifyCover, SpotifyProgress, SpotifyVolume, useSpotifyOnDashboard, Equalizer } from '../../components/Spotify';
import { NX } from '../../components/HomeTwin';
import { Panel } from './Panel';

/** Music while it plays (Spotify): cover, title, position, all controls and – unless `compact` (kiosk in portrait format, position next to the cover) – the volume. */
export function NowPlaying({ compact }: { compact: boolean }) {
  const show = useSpotifyOnDashboard();
  const s = useStore((x) => x.spotify);
  if (!show || !s?.track) return null;
  return (
    <Panel title="Musik" right={s.device?.name.toUpperCase()} to="spotify" color={NX.green}>
      <div className="nx-music">
        <SpotifyCover track={s.track} small className="nx-music-cover" />
        <div className="min-w-0 flex-1 nx-music-meta">
          <div className="nx-pfile !mt-0 flex items-center gap-2"><Equalizer playing={s.playing} className="shrink-0" /> <span className="truncate">{s.track.name}</span></div>
          <div className="nx-music-artist">{s.track.artists}</div>
          {compact && <SpotifyProgress s={s} compact />}
        </div>
      </div>
      {!compact && <SpotifyProgress s={s} compact className="mt-2.5" />}
      <SpotifyControls s={s} size="sm" className="mt-1.5 nx-spc" />
      {!compact && <SpotifyVolume s={s} />}
    </Panel>
  );
}
