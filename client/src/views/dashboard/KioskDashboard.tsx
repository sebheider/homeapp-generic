/** One-screen overview for kiosk displays, in landscape and portrait format. */
import { useStore } from '../../lib/store';
import { usePortrait } from '../../lib/displayHooks';
import { useOverview } from '../../lib/overview';
import { useEnergy } from '../../components/Energy';
import { PrinterStrip, usePrintOnOverview } from '../../components/Printer';
import { SpotifyStrip, useSpotifyOnDashboard } from '../../components/Spotify';
import { useActiveMower } from '../../components/Mower';
import { HeroPanel } from './HeroPanel';
import { useOverviewGauges, GaugeGrid } from './Gauges';
import { EnergyPanel } from './EnergyPanel';
import { MowerPanel } from './MowerPanel';
import { SecurityPanel } from './SecurityPanel';
import { RoomMatrix } from './RoomMatrix';
import { ScenePanel } from './ScenePanel';

/**
 * Kiosk layout (permanent screen, optimised for 1280×800): everything on one screen without
 * scrolling – hero on top, gauges / energy / security in the middle (they share the remaining
 * height), rooms as a sideways scrolling strip and the scenes at the bottom.
 */
export function KioskDashboard() {
  const portrait = usePortrait();
  if (portrait) return <KioskPortraitDashboard />;
  return <KioskLandscapeDashboard />;
}

/**
 * Kiosk layout in portrait format (optimised for 800×1280, e.g. 1200×1920 at 1.5×): the panels are
 * stacked – hero, gauges, energy | security (both share the remaining height), rooms strip and scenes.
 */
function KioskPortraitDashboard() {
  const o = useOverview();
  const energy = useEnergy();
  const scenes = useStore((s) => s.config!.scenes);
  const reduceEffects = useStore((s) => s.display.kioskReduceEffects);
  const hasSecurity = useStore((s) => s.cameras.length > 0 || s.motion.length > 0) || o.contacts.length > 0;
  const hasGauges = useOverviewGauges(o, energy, true).length > 0;
  // while the mower mows, its map takes the place of the energy flow
  const mower = useActiveMower();
  const hasFlow = energy.enabled || mower !== null;
  const hasPanels = hasFlow || hasSecurity;
  const printing = usePrintOnOverview();
  const music = useSpotifyOnDashboard();
  // the gauges (three in a flat row) need less height than the flow and the cameras, which grow with every pixel;
  // below the minimum heights (alarm banners, many strips) the page scrolls instead of squeezing the panels
  // content rows use max-content: with 'auto' Chromium underestimates overflow-hidden panels and the rows overlap
  const rows = ['max-content', printing && 'max-content', music && 'max-content', hasGauges && 'minmax(6.5rem, 0.55fr)', hasPanels && 'minmax(14rem, 1.35fr)', o.rooms.length > 0 && 'max-content', scenes.length > 0 && 'max-content'].filter(Boolean).join(' ');
  return (
    <div className={`kiosk-dash kiosk-portrait kiosk-scroll grid gap-3 ${reduceEffects ? 'kiosk-reduce-effects' : ''}`} style={{ gridTemplateRows: rows }}>
      <HeroPanel o={o} energy={energy} portrait />
      {printing && <PrinterStrip />}
      {music && <SpotifyStrip />}
      {hasGauges && <GaugeGrid o={o} energy={energy} compact />}
      {hasPanels && (
        <div className="kiosk-fill grid gap-3 min-h-0" style={{ gridTemplateColumns: hasFlow && hasSecurity ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)' }}>
          {mower ? <MowerPanel d={mower} compact /> : energy.enabled && <EnergyPanel energy={energy} compact side />}
          {hasSecurity && <SecurityPanel contacts={o.contacts} compact />}
        </div>
      )}
      {o.rooms.length > 0 && <RoomMatrix rooms={o.rooms} strip columns={4} />}
      {scenes.length > 0 && <ScenePanel row />}
    </div>
  );
}

/** Kiosk layout in landscape format, see `KioskDashboard`. */
function KioskLandscapeDashboard() {
  const o = useOverview();
  const energy = useEnergy();
  const scenes = useStore((s) => s.config!.scenes);
  const reduceEffects = useStore((s) => s.display.kioskReduceEffects);
  const hasSecurity = useStore((s) => s.cameras.length > 0 || s.motion.length > 0) || o.contacts.length > 0;
  const printing = usePrintOnOverview();
  const music = useSpotifyOnDashboard();
  // while the mower mows, its map takes the place of the energy flow
  const mower = useActiveMower();
  const middle = ['minmax(0, 1.15fr)', (energy.enabled || mower) && 'minmax(0, 1fr)', hasSecurity && 'minmax(0, 1fr)'].filter(Boolean).join(' ');
  // below the minimum height (alarm banners) the page scrolls instead of squeezing the gauges
  const rows = ['max-content', (printing || music) && 'max-content', 'minmax(14rem, 1fr)', 'max-content'].filter(Boolean).join(' ');
  return (
    <div className={`kiosk-dash kiosk-scroll grid gap-3 ${reduceEffects ? 'kiosk-reduce-effects' : ''}`} style={{ gridTemplateRows: rows }}>
      <HeroPanel o={o} energy={energy} compact />
      {(printing || music) && (
        // print and music share one row, so the gauges keep their height
        <div className="grid gap-3 min-w-0" style={{ gridTemplateColumns: printing && music ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)' }}>
          {printing && <PrinterStrip />}
          {music && <SpotifyStrip half={printing} />}
        </div>
      )}
      <div className="kiosk-fill grid gap-3 min-h-0" style={{ gridTemplateColumns: middle }}>
        <GaugeGrid o={o} energy={energy} compact />
        {mower ? <MowerPanel d={mower} compact /> : energy.enabled && <EnergyPanel energy={energy} compact />}
        {hasSecurity && <SecurityPanel contacts={o.contacts} compact />}
      </div>
      {(o.rooms.length > 0 || scenes.length > 0) && (
        <div className="grid gap-3 min-h-0" style={{ gridTemplateColumns: o.rooms.length && scenes.length ? 'minmax(0, 1fr) minmax(0, 19rem)' : 'minmax(0, 1fr)' }}>
          {o.rooms.length > 0 && <RoomMatrix rooms={o.rooms} strip />}
          {scenes.length > 0 && <ScenePanel compact />}
        </div>
      )}
    </div>
  );
}
