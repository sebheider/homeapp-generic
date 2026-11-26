import { Fan } from 'lucide-react';
import { isOn } from '../../lib/store';
import type { ChoiceOption, Device, ModeOption } from '../../lib/types';
import { runningIconClass } from '../../lib/iconFx';
import { toNum } from '../../lib/format';
import { Dial, Toggle } from '../ui';
import { useVals, useSet, HEAT_TONE, COOL_TONE, temp, Head, ChipGroup } from './shared';

/** Air conditioner card: power, operating mode, setpoint dial (one setpoint per mode if configured) and fan level. */
export function ClimateCard({ d }: { d: Device }) {
  const v = useVals(d);
  const set = useSet();
  const on = isOn(v.power);
  const min = toNum(d.options.min, 16);
  const max = toNum(d.options.max, 30);
  const step = toNum(d.options.step, 1);
  const modes: ModeOption[] = d.options.modes || [];
  const fans: ChoiceOption[] = d.options.fanModes || [];
  const mode = String(v.mode ?? '');
  const activeMode = modes.find((m) => String(m.value) === mode);
  // Units like Daikin keep one setpoint per operating mode (targetHeat / targetCool / targetAuto).
  // If modes define their own setpoint, the shared one is not used (no dial for modes without one).
  const targetKey = activeMode?.target && d.states[activeMode.target] ? activeMode.target : modes.some((m) => m.target) ? null : d.states.target ? 'target' : null;
  const isHeat = activeMode?.icon === 'flame' || mode === 'heat';
  const tone = isHeat ? 'tone-heat' : activeMode?.icon === 'droplets' || mode === 'dry' ? 'tone-violet' : 'tone-cool';
  const current = d.states.current ? temp(v.current) : null;
  return (
    <div className={`glass tile ${tone} p-4 flex flex-col gap-3 ${on ? 'active' : ''}`}>
      <Head
        d={d}
        // while running the icon shows the operating mode (flame flickers, snowflake turns, fan spins)
        icon={on && activeMode?.icon ? activeMode.icon : 'snowflake'}
        on={on}
        glow={on ? 0.7 : undefined}
        iconClass={on ? runningIconClass(activeMode?.icon || 'snowflake') : ''}
        sub={on ? `${activeMode?.label ?? 'An'}${current !== null ? ` · Ist ${current} °C` : ''}` : current !== null ? `Aus · Raum ${current} °C` : 'Aus'}
        right={<Toggle checked={on} onChange={(x) => set(d.states.power, x)} label={d.name} />}
      />
      {targetKey && (
        <div className={`transition-opacity ${on ? '' : 'opacity-40 pointer-events-none'}`}>
          <Dial value={toNum(v[targetKey], min)} min={min} max={max} step={step} onChange={(x) => set(d.states[targetKey], x)} sub="Soll" size={150} tone={isHeat ? HEAT_TONE : COOL_TONE} />
        </div>
      )}
      {modes.length > 0 && d.states.mode && <ChipGroup options={modes} current={mode} onSelect={(x) => set(d.states.mode, x)} />}
      {fans.length > 0 && d.states.fan && (
        <ChipGroup options={fans} current={String(v.fan)} onSelect={(x) => set(d.states.fan, x)} className="flex gap-2 flex-wrap items-center">
          <Fan size={15} className={`text-muted ${on ? 'anim-spin-fast' : ''}`} />
        </ChipGroup>
      )}
    </div>
  );
}
