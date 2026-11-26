/**
 * Overview page in the optional "Nexus" design (chosen per device under Einstellungen → Anzeige):
 * a holographic digital twin of the house in the middle, framed by cockpit panels –
 *   left:   clock with day line, hints (notifications and tips), music while it plays, room climate
 *   right:  weather with a 12 h curve, security (cameras, doors / windows), a running 3D print, lights
 *   bottom: energy flow with a 24 h waveform, scenes
 * Always dark (the app shell switches to the dark theme while it is shown). Every panel leads to its
 * page. `fill` (kiosk): the cockpit fills exactly one screen on wide displays; smaller screens stack the
 * panels and scroll. Kiosk in portrait format (`NexusTall`, e.g. 1200×1920): clock and weather (with
 * CO₂ traffic light and UV index) on top, the twin as a big framed panel with its callouts as cards on
 * the right, below only what is going on (cameras after a detection, open doors, print, music) next to
 * lights and scenes, energy at the bottom. Notifications are behind the bell of the top bar there.
 * Uses the same data as the standard design (lib/overview.ts).
 */
import '@fontsource/orbitron/latin-600.css';
import '@fontsource/orbitron/latin-700.css';
import '@fontsource/rajdhani/latin-500.css';
import '@fontsource/rajdhani/latin-600.css';
import '@fontsource/rajdhani/latin-700.css';
import './nexus.css';
import { useStore } from '../lib/store';
import { useWeatherData } from '../lib/weather';
import { usePortrait } from '../lib/displayHooks';
import { useOverview } from '../lib/overview';
import { useEnergy } from '../components/Energy';
import { KioskSensorsPanel } from '../components/KioskSensors';
import { Chrono } from './nexus/Chrono';
import { Hints } from './nexus/Hints';
import { Climate } from './nexus/Climate';
import { Center } from './nexus/Center';
import { Atmosphere } from './nexus/Atmosphere';
import { Security } from './nexus/Security';
import { Print } from './nexus/Print';
import { NowPlaying } from './nexus/NowPlaying';
import { Lights } from './nexus/Lights';
import { EnergyStrip } from './nexus/EnergyStrip';
import { Scenes } from './nexus/Scenes';
import { NexusTall } from './nexus/NexusTall';

export function NexusDashboard({ fill = false }: { fill?: boolean }) {
  const o = useOverview();
  const energy = useEnergy();
  const { data: weather } = useWeatherData();
  const hasScenes = useStore((s) => (s.config?.scenes.length ?? 0) > 0);
  const portraitFill = usePortrait() && fill;
  if (portraitFill) return <NexusTall o={o} energy={energy} weather={weather} />;
  const bottom = Number(energy.enabled) + Number(hasScenes);
  return (
    <div className={`nx ${fill ? 'nx-fill' : ''}`}>
      <div className="nx-grid">
        <div className="nx-col nx-left">
          <Chrono weather={weather} />
          <Hints o={o} energy={energy} max={fill ? 2 : 3} />
          <NowPlaying compact={false} />
          <Climate o={o} />
        </div>
        <Center o={o} energy={energy} />
        <div className="nx-col nx-right">
          <Atmosphere weather={weather} fallback={o.outside} compact={fill} />
          <Security o={o} fill={fill} />
          <Print fill={fill} compact={false} />
          <Lights o={o} compact={false} />
        </div>
        <div className={`nx-bottom ${bottom === 2 ? 'two' : ''}`}>
          <KioskSensorsPanel compact className="col-span-full" />
          <EnergyStrip energy={energy} />
          <Scenes />
        </div>
      </div>
    </div>
  );
}
