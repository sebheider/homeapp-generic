import type { ReactNode } from 'react';
import { useStore } from '../../lib/store';
import type { WeatherData } from '../../lib/api';
import type { Overview } from '../../lib/overview';
import type { EnergyValues } from '../../components/Energy';
import { usePrintOnOverview } from '../../components/Printer';
import { useSpotifyOnDashboard } from '../../components/Spotify';
import { Chrono } from './Chrono';
import { Center } from './Center';
import { Atmosphere, AirChips } from './Atmosphere';
import { useMotionCams, Alerts } from './Security';
import { Print } from './Print';
import { NowPlaying } from './NowPlaying';
import { Lights } from './Lights';
import { EnergyStrip } from './EnergyStrip';
import { Scenes } from './Scenes';

/**
 * Kiosk in portrait format: clock | weather, the framed twin (takes the height that is left), then the
 * panels of the moment in two balanced columns, energy at the bottom.
 */
export function NexusTall({ o, energy, weather }: { o: Overview; energy: EnergyValues; weather: WeatherData | null }) {
  const scenes = useStore((s) => s.config?.scenes.length ?? 0);
  const printShown = usePrintOnOverview();
  const hasPrinter = useStore((s) => s.printer != null);
  const musicShown = useSpotifyOnDashboard();
  const hasTrack = useStore((s) => s.spotify?.track != null);
  const printing = printShown && hasPrinter;
  const music = musicShown && hasTrack;
  const cams = useMotionCams();
  const web = weather?.configured ? weather : null;
  // estimated heights (px) balance the two columns; the order decides the column when they are equal
  const items: { key: string; h: number; node: ReactNode }[] = [];
  if (o.lights.length) items.push({ key: 'lights', h: 84, node: <Lights key="lights" o={o} compact /> });
  if (scenes) items.push({ key: 'scenes', h: 52 + Math.min(2, Math.ceil(scenes / 2)) * 51, node: <Scenes key="scenes" /> });
  if (cams.length || o.openContacts.length) items.push({ key: 'alerts', h: (cams.length ? 200 : 50) + (o.openContacts.length ? 40 : 0), node: <Alerts key="alerts" o={o} cams={cams} /> });
  if (printing) items.push({ key: 'print', h: 100, node: <Print key="print" fill compact /> });
  if (music) items.push({ key: 'music', h: 124, node: <NowPlaying key="music" compact /> });
  const cols: [ReactNode[], ReactNode[]] = [[], []];
  const height = [0, 0];
  for (const it of items) {
    const k = height[0] <= height[1] ? 0 : 1;
    cols[k].push(it.node);
    height[k] += it.h + 12;
  }
  return (
    <div className="nx nx-fill">
      <div className="nx-tall">
        <div className="nx-pair">
          <Chrono weather={weather} />
          <Atmosphere weather={weather} fallback={o.outside} compact>
            <AirChips o={o} uv={web?.current.uv ?? null} uvMax={web?.daily[0]?.uvMax ?? null} />
          </Atmosphere>
        </div>
        <Center o={o} energy={energy} framed />
        {items.length > 0 && (
          <div className="nx-duo">
            <div className="nx-col">{cols[0]}</div>
            <div className="nx-col">{cols[1]}</div>
          </div>
        )}
        <EnergyStrip energy={energy} />
      </div>
    </div>
  );
}
