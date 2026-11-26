import { isOn } from '../../lib/store';
import type { Device } from '../../lib/types';
import { runningIconClass } from '../../lib/iconFx';
import { powerText, toNum } from '../../lib/format';
import { Toggle } from '../ui';
import { useVals, useSet, Head } from './shared';

/** Plug / switch: the whole tile toggles; shows the consumption while on (if mapped). */
export function SwitchCard({ d }: { d: Device }) {
  const v = useVals(d);
  const set = useSet();
  const on = isOn(v.power);
  const w = d.states.consumption ? toNum(v.consumption) : null;
  return (
    <div className={`glass tile interactive tone-green p-4 ${on ? 'active' : ''}`} onClick={() => set(d.states.power, !on)}>
      <Head
        d={d}
        icon="plug"
        on={on}
        // a plug that draws power (or has no meter) counts as running: its icon moves and glows brighter
        glow={on ? (w === null || w > 0 ? 0.8 : 0.35) : undefined}
        iconClass={on && (w === null || w > 0) ? runningIconClass(d.icon || 'plug') : ''}
        sub={w !== null && on ? `${powerText(w)}${w > 0 ? ' · läuft' : ''}` : on ? 'An' : 'Aus'}
        right={<Toggle checked={on} onChange={(x) => set(d.states.power, x)} label={d.name} />}
      />
    </div>
  );
}
