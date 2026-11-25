/** Settings tab "Energie": datapoints and sign conventions of the energy system. */
import { ENERGY_FIELDS } from '../../lib/deviceTypes';
import { StatePicker } from '../../components/Pickers';
import { Toggle } from '../../components/ui';
import { Card, Field, Switch, dimUnless, sectionSetter, type TabProps } from './shared';

/** Energy system switch, datapoint pickers and sign inversion switches. */
export function EnergyTab({ draft, setDraft }: TabProps) {
  const e = draft.energy;
  const set = sectionSetter(draft, setDraft, 'energy');
  return (
    <Card title="Energiesystem (PV, Speicher, Netz)" right={<Toggle checked={e.enabled} onChange={(v) => set({ enabled: v })} label="Energie aktiv" />}>
      <div className={`grid sm:grid-cols-2 gap-4 ${dimUnless(e.enabled)}`}>
        {ENERGY_FIELDS.map((f) => (
          <Field key={f.key} label={f.label}>
            <StatePicker value={e.states[f.key] ?? ''} onChange={(id) => set({ states: { ...e.states, [f.key]: id } })} />
          </Field>
        ))}
      </div>
      <div className={`mt-3 grid sm:grid-cols-2 gap-x-8 ${dimUnless(e.enabled)}`}>
        <Switch label="Netz-Vorzeichen umkehren (Standard: + = Bezug)" checked={e.gridInvert} onChange={(v) => set({ gridInvert: v })} />
        <Switch label="Batterie-Vorzeichen umkehren (Standard: + = Entladen)" checked={e.batteryInvert} onChange={(v) => set({ batteryInvert: v })} />
      </div>
    </Card>
  );
}
