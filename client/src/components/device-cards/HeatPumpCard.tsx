import type { ReactNode } from 'react';
import { Flame, Minus, Plus, Waves, Droplets, Zap } from 'lucide-react';
import { isOn } from '../../lib/store';
import type { Device, ModeOption } from '../../lib/types';
import { heatPumpRunning, heatPumpWatts } from '../../lib/heatpump';
import { clamp, NO_VALUE, powerText, toNum } from '../../lib/format';
import { Toggle } from '../ui';
import { useVals, useSet, temp, Head, ChipGroup } from './shared';

/** Small key-figure box of the heat pump card. */
function Metric({ label, value, unit, icon }: { label: string; value: ReactNode; unit?: string; icon?: ReactNode }) {
  return (
    <div className="rounded-2xl p-3 bg-[color-mix(in_srgb,var(--fg)_5%,transparent)] border border-line">
      <div className="text-[0.7rem] uppercase tracking-wider text-muted flex items-center gap-1.5">{icon}{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">
        {value}
        {unit && <span className="text-sm font-medium text-muted ml-1">{unit}</span>}
      </div>
    </div>
  );
}

/** Heat pump: operating state, key figures (only those that are mapped), operating mode chips and hot water setpoint. */
export function HeatPumpCard({ d }: { d: Device }) {
  const v = useVals(d);
  const set = useSet();
  const has = (k: string) => Boolean(d.states[k]);
  const running = heatPumpRunning(d, v);
  const on = has('power') ? isOn(v.power) : true;
  const t = (k: string) => (v[k] == null ? NO_VALUE : temp(v[k]));
  const dhwMin = toNum(d.options.dhwMin, 35);
  const dhwMax = toNum(d.options.dhwMax, 65);
  const modes: ModeOption[] = Array.isArray(d.options.modes) ? d.options.modes : [];
  const bumpDhw = (delta: number) => set(d.states.dhwTarget, clamp(toNum(v.dhwTarget) + delta, dhwMin, dhwMax));
  return (
    <div className={`glass tile tone-warm p-4 flex flex-col gap-4 ${running ? 'active' : ''}`}>
      <Head
        d={d}
        icon="heater"
        on={running}
        glow={running ? 0.85 : undefined}
        sub={!on ? 'Aus' : running ? 'Verdichter läuft' : 'Bereit'}
        right={has('power') ? <Toggle checked={on} onChange={(x) => set(d.states.power, x)} label={d.name} /> : undefined}
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {has('flowTemp') && <Metric label="Vorlauf" value={t('flowTemp')} unit="°C" icon={<Waves size={12} />} />}
        {has('returnTemp') && <Metric label="Rücklauf" value={t('returnTemp')} unit="°C" icon={<Waves size={12} />} />}
        {has('outsideTemp') && <Metric label="Außen" value={t('outsideTemp')} unit="°C" />}
        {has('electricPower') && <Metric label="Strom" value={powerText(heatPumpWatts(d, v.electricPower))} icon={<Zap size={12} />} />}
        {has('heatPower') && <Metric label="Wärme" value={powerText(heatPumpWatts(d, v.heatPower))} icon={<Flame size={12} />} />}
        {has('cop') && <Metric label="COP" value={t('cop')} />}
      </div>
      {has('mode') && modes.length > 0 && <ChipGroup options={modes} current={String(v.mode)} onSelect={(x) => set(d.states.mode, x)} />}
      {has('dhwTemp') && (
        <div className="rounded-2xl p-3 border border-line flex items-center gap-3 bg-[color-mix(in_srgb,var(--fg)_5%,transparent)]">
          <div className="icon-bubble on !w-10 !h-10"><Droplets size={18} /></div>
          <div className="flex-1">
            <div className="text-xs text-muted">Warmwasser</div>
            <div className="font-bold tabular-nums text-lg">
              {t('dhwTemp')} °C
              {has('dhwTarget') && <span className="text-sm text-muted font-medium"> / Soll {t('dhwTarget')} °C</span>}
            </div>
          </div>
          {has('dhwTarget') && (
            <div className="flex items-center gap-1.5">
              <button className="btn btn-icon" onClick={() => bumpDhw(-1)} aria-label="Weniger"><Minus size={16} /></button>
              <button className="btn btn-icon" onClick={() => bumpDhw(1)} aria-label="Mehr"><Plus size={16} /></button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
