import { useStore } from '../../../lib/store';
import { SpotifyPanel, useSpotifyOnDashboard } from '../../../components/Spotify';
import { WidgetNote } from './WidgetNote';

/** Mini player while music plays; otherwise the cell stays empty (a hint while editing, so it can be placed). */
export function SpotifyWidget() {
  const show = useSpotifyOnDashboard();
  const editing = useStore((s) => s.dashboardDraft !== null);
  if (show) return <SpotifyPanel />;
  return editing ? <WidgetNote type="spotify" text="Erscheint nur, solange Musik läuft." /> : null;
}
