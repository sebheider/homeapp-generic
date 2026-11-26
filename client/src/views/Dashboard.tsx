/**
 * Overview page ("Übersicht") as a futuristic command centre:
 *   - hero: clock, greeting and status chips | "Home Core" showing the state of the house | weather with the
 *     UV index and its forecast
 *   - while a 3D print runs: webcam, progress and remaining time (kiosk: a one-row strip)
 *   - while music plays (Spotify): a mini player with all controls (kiosk: a one-row strip)
 *   - live gauges: battery, lights, heat pump (the own start page offers the other gauges as widgets)
 *   - energy flow with a 24 h curve – while a robotic mower mows, its live map in that place – and
 *     security (cameras, activity timeline, doors / windows)
 *   - a matrix of all rooms, the scenes and the lights that are on
 * Every panel leads to its detail page; those stay plain and functional.
 * In kiosk mode (permanent screen, see lib/display.ts) a compact variant fills exactly one screen –
 * side by side on landscape screens, stacked on portrait screens (e.g. 1200×1920).
 * The panels and the page layouts live in views/dashboard/ (one module each); this module picks the
 * design and re-exports the panels. The data of the overview designs comes from lib/overview.ts; the
 * optional "Nexus" design lives in NexusDashboard.tsx, the freely designable start page ("Eigene") in
 * CustomDashboard.tsx – its widgets reuse the panels exported here.
 */
import { lazy, Suspense } from 'react';
import { useStore } from '../lib/store';
import { useKioskLayout } from '../lib/displayHooks';
import { Loading } from '../components/ui';
import { KioskDashboard } from './dashboard/KioskDashboard';
import { StandardDashboard } from './dashboard/StandardDashboard';

export { C } from './dashboard/colors';
export { HeroClock } from './dashboard/HeroClock';
export { StatusChips } from './dashboard/StatusChips';
export { HeroWeather } from './dashboard/HeroWeather';
export { useHouseState, HouseCore } from './dashboard/HouseCore';
export type { HouseState } from './dashboard/HouseCore';
export { useGaugeTiles } from './dashboard/Gauges';
export { EnergyPanel } from './dashboard/EnergyPanel';
export { HudCamera, SecurityPanel } from './dashboard/SecurityPanel';
export { RoomPod, RoomMatrix } from './dashboard/RoomMatrix';
export { ScenePanel } from './dashboard/ScenePanel';

// the optional "Nexus" design is only loaded when this device uses it
const NexusDashboard = lazy(() => import('./NexusDashboard').then((m) => ({ default: m.NexusDashboard })));
// the same for the freely designable start page
const CustomDashboard = lazy(() => import('./CustomDashboard').then((m) => ({ default: m.CustomDashboard })));

/**
 * Dashboard page in the design chosen for this device: "Nexus" (digital twin, loaded on demand), the
 * own start page (widgets, loaded on demand) or the standard command centre – as one-screen kiosk
 * layout on a kiosk display, otherwise scrolling.
 */
export function Dashboard() {
  const kiosk = useKioskLayout(useStore((s) => s.display.kiosk));
  const design = useStore((s) => s.display.dashboardDesign);
  if (design === 'nexus' || design === 'custom') {
    return (
      <Suspense fallback={<Loading />}>
        {design === 'nexus' ? <NexusDashboard fill={kiosk} /> : <CustomDashboard fill={kiosk} />}
      </Suspense>
    );
  }
  return kiosk ? <KioskDashboard /> : <StandardDashboard />;
}
