import type { Device } from '../../lib/types';
import { glowLevel } from '../../lib/iconFx';
import { toNum } from '../../lib/format';
import { Dial } from '../ui';
import { useVals, useSet, HEAT_TONE, temp, Head } from './shared';

/** Radiator thermostat: setpoint dial; the tile glows and the flame flickers while the valve is open. */
export function ThermostatCard({ d }: { d: Device }) {
  const v = useVals(d);
  const set = useSet();
  const min = toNum(d.options.min, 5);
  const max = toNum(d.options.max, 30);
  const step = toNum(d.options.step, 0.5);
  const target = toNum(v.target, min);
  const valve = toNum(v.valve);
  const heating = valve > 5;
  return (
    <div className={`glass tile ${heating ? 'tone-heat active' : 'tone-warm'} p-4 flex flex-col gap-2`}>
      <Head d={d} icon="flame" on={heating} iconClass={heating ? 'anim-flicker' : ''} glow={heating ? glowLevel(valve) : undefined} sub={heating ? `Heizt · Ventil ${Math.round(valve)} %` : undefined} />
      <Dial
        value={target}
        min={min}
        max={max}
        step={step}
        onChange={(x) => set(d.states.target, x)}
        sub={d.states.current ? `Ist ${temp(v.current)} °C` : 'Soll'}
        tone={heating ? HEAT_TONE : '#fb923c'}
      />
    </div>
  );
}
