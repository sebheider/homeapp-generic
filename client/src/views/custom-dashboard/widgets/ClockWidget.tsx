import { greeting } from '../../../lib/format';
import type { Overview } from '../../../lib/overview';
import type { EnergyValues } from '../../../components/Energy';
import { HudPanel } from '../../../components/Hud';
import { C } from '../../dashboard/colors';
import { HeroClock } from '../../dashboard/HeroClock';
import { StatusChips } from '../../dashboard/StatusChips';

/** Clock with greeting and date; `chips`: the status chips of the overview below it. */
export function ClockWidget({ o, energy, chips }: { o: Overview; energy: EnergyValues; chips: boolean }) {
  const today = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <HudPanel color={C.cyan}>
      <HeroClock compact />
      <p className="text-sm mt-2 truncate">
        <b>{greeting()}</b> <span className="text-muted capitalize">· {today}</span>
      </p>
      {chips && <StatusChips o={o} energy={energy} max={4} />}
    </HudPanel>
  );
}
