import type { ReactNode } from 'react';
import { ArrowRight, LayoutGrid, Power } from 'lucide-react';
import { useStore } from '../../lib/store';
import { switchAllOff } from '../../lib/selectors';
import { useOverview } from '../../lib/overview';
import { DeviceTiles } from '../../components/DeviceCards';
import { useEnergy } from '../../components/Energy';
import { PrinterPanel, usePrintOnOverview } from '../../components/Printer';
import { SpotifyPanel, useSpotifyOnDashboard } from '../../components/Spotify';
import { useActiveMower } from '../../components/Mower';
import { Empty, OpenSettingsButton, Rise, Stagger } from '../../components/ui';
import { HeroPanel } from './HeroPanel';
import { GaugeGrid } from './Gauges';
import { EnergyPanel } from './EnergyPanel';
import { MowerPanel } from './MowerPanel';
import { SecurityPanel } from './SecurityPanel';
import { RoomMatrix } from './RoomMatrix';
import { ScenePanel } from './ScenePanel';

/** Section heading with an optional "more" link and extra controls on the right. */
function SectionTitle({ children, action, extra }: { children: ReactNode; action?: { label: string; onClick: () => void }; extra?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h2 className="section-title">{children}</h2>
      <div className="flex items-center gap-3">
        {extra}
        {action && (
          <button className="text-xs text-muted hover:text-fg inline-flex items-center gap-1 transition-colors" onClick={action.onClick}>
            {action.label} <ArrowRight size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Scrolling overview for phones, tablets and desktops. */
export function StandardDashboard() {
  const o = useOverview();
  const energy = useEnergy();
  const scenes = useStore((s) => s.config!.scenes);
  const hasSecurity = useStore((s) => s.cameras.length > 0 || s.motion.length > 0) || o.contacts.length > 0;
  const setView = useStore((s) => s.setView);
  const set = useStore((s) => s.set);
  const printing = usePrintOnOverview();
  const music = useSpotifyOnDashboard();
  // while the mower mows, its map takes the place of the energy flow
  const mower = useActiveMower();
  const hasFlow = energy.enabled || mower !== null;

  return (
    <Stagger className="standard-dash flex flex-col gap-4 sm:gap-5">
      <Rise>
        <HeroPanel o={o} energy={energy} />
      </Rise>

      {(printing || music) && (
        <Rise>
          {/* side by side on wide screens when both run */}
          <div className={`grid gap-4 sm:gap-5 ${printing && music ? 'xl:grid-cols-2' : ''}`}>
            {printing && <PrinterPanel />}
            {music && <SpotifyPanel />}
          </div>
        </Rise>
      )}

      <Rise>
        <GaugeGrid o={o} energy={energy} />
      </Rise>

      {(hasFlow || hasSecurity) && (
        <Rise>
          {/* energy (or the mowing mower) and security side by side on wide screens when both exist */}
          <div className={`grid gap-4 sm:gap-5 ${hasFlow && hasSecurity ? 'lg:grid-cols-2' : ''}`}>
            {mower ? <MowerPanel d={mower} /> : energy.enabled && <EnergyPanel energy={energy} />}
            {hasSecurity && <SecurityPanel contacts={o.contacts} />}
          </div>
        </Rise>
      )}

      {o.rooms.length > 0 && (
        <Rise>
          <RoomMatrix rooms={o.rooms} />
        </Rise>
      )}

      {scenes.length > 0 && (
        <Rise>
          <ScenePanel />
        </Rise>
      )}

      {o.lightsOn.length > 0 && (
        <Rise>
          <SectionTitle
            action={{ label: 'Alle Lichter', onClick: () => setView('lights') }}
            extra={
              <button className="btn !py-1.5 !text-xs" onClick={() => switchAllOff(o.lightsOn, set)}>
                <Power size={13} /> Alle aus
              </button>
            }
          >
            Eingeschaltet
          </SectionTitle>
          <div className="grid-cards">
            <DeviceTiles devices={o.lightsOn.slice(0, 8)} />
          </div>
        </Rise>
      )}

      {o.devices.length === 0 && (
        <Rise>
          <Empty icon={<LayoutGrid size={28} />} title="Noch keine Geräte eingerichtet" text="Öffne die Einstellungen und lasse deine ioBroker-Installation automatisch erkennen.">
            <OpenSettingsButton />
          </Empty>
        </Rise>
      )}
    </Stagger>
  );
}
