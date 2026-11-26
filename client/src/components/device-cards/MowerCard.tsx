import { ChevronRight } from 'lucide-react';
import { useStore } from '../../lib/store';
import type { Device } from '../../lib/types';
import { isDriving, mowerStatus, suggestedCommands, type MowerCommand } from '../../lib/mower';
import { LevelBar } from '../ui';
import { toneStyle } from '../Hud';
import { MowerCommandButtons, numOrNull } from '../Mower';
import { useVals, Head } from './shared';

/**
 * Robotic mower: state and battery, the mowing progress while a session runs and the one or two commands
 * that fit the state; a tap on the head opens the mower page with map and all controls.
 */
export function MowerCard({ d }: { d: Device }) {
  const v = useVals(d);
  const setView = useStore((s) => s.setView);
  const status = mowerStatus(v.state);
  const driving = isDriving(status.activity);
  const battery = d.states.battery ? numOrNull(v.battery) : null;
  const progress = d.states.progress ? numOrNull(v.progress) : null;
  const suggested = suggestedCommands(status.activity);
  const only: MowerCommand[] = suggested.length ? suggested : ['start', 'home'];
  return (
    <div className={`glass tile p-4 flex flex-col gap-3 ${driving || status.problem ? 'active' : ''}`} style={toneStyle(status.color)}>
      <div className="cursor-pointer" onClick={() => setView('mower')}>
        <Head
          d={d}
          icon="mower"
          on={driving || status.problem}
          glow={driving ? 0.7 : undefined}
          iconClass={driving ? 'anim-bob' : status.problem ? 'anim-alarm' : ''}
          sub={battery !== null ? `${status.label} · Akku ${Math.round(battery)} %` : status.label}
          right={<ChevronRight size={18} className="text-muted" aria-label="Mähroboter-Seite öffnen" />}
        />
      </div>
      {progress !== null && (driving || status.activity === 'paused') && <LevelBar value={progress} label="Fortschritt" />}
      <MowerCommandButtons d={d} activity={status.activity} compact only={only} />
    </div>
  );
}
