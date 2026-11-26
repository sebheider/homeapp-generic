import type { CSSProperties } from 'react';
import { isOn } from '../../lib/store';
import type { Device } from '../../lib/types';
import { Icon } from '../../lib/icons';
import { glowLevel } from '../../lib/iconFx';
import { clamp, toNum } from '../../lib/format';
import { useVals, useSet } from './shared';

/** Small tile of a light or switch: icon, name and state; a tap switches it (no slider or colours). */
export function SmallSwitch({ d }: { d: Device }) {
  const v = useVals(d);
  const set = useSet();
  const isLight = d.type === 'light';
  const max = toNum(d.options.brightnessMax, 100);
  // like the light card: dimmer-only devices count as "on" while their brightness is above 0
  const viaDimmer = isLight && !d.states.power && Boolean(d.states.brightness);
  const on = viaDimmer ? toNum(v.brightness) > 0 : isOn(v.power);
  const bri = isLight && d.states.brightness ? Math.round((toNum(v.brightness) / max) * 100) : null;
  const toggle = () => (viaDimmer ? set(d.states.brightness, on ? 0 : max) : set(d.states.power, !on));
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={`glass tile interactive ${isLight ? 'tone-light' : 'tone-green'} !rounded-2xl px-2.5 py-2 flex items-center gap-2 text-left min-w-0 ${on ? 'active' : ''}`}
      style={isLight ? ({ ['--level' as string]: bri != null ? clamp(bri, 0, 100) / 100 : 1 } as CSSProperties) : undefined}
      onClick={toggle}
    >
      <span className={`icon-bubble ${on ? 'on halo' : ''} !w-8 !h-8 !rounded-xl shrink-0`} style={on ? ({ ['--glow' as string]: isLight ? glowLevel(bri) : 0.6 } as CSSProperties) : undefined}>
        <Icon name={d.icon || (isLight ? 'light' : 'plug')} size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-tight line-clamp-2 break-words">{d.name}</span>
        <span className="block text-[0.7rem] text-muted truncate">{on ? (bri != null ? `${bri} %` : 'An') : 'Aus'}</span>
      </span>
    </button>
  );
}
