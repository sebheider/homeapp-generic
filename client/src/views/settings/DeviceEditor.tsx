/** Dialog for creating / editing a device: name, type, room, icon, type specific options and datapoints. */
import { useState } from 'react';
import { Download, LoaderCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { useStore } from '../../lib/store';
import { DEVICE_TYPES, type OptionField } from '../../lib/deviceTypes';
import { parseList, stringifyList } from '../../lib/format';
import type { ChoiceOption, Device, DeviceType, Room } from '../../lib/types';
import { IconPicker, StatePicker } from '../../components/Pickers';
import { Modal } from '../../components/ui';
import { Field, NumInput, Switch } from './shared';

/** Input for one device option; the kind of input follows `field.kind`. Empty inputs store undefined. */
function OptionInput({ field, value, onChange }: { field: OptionField; value: unknown; onChange: (v: unknown) => void }) {
  if (field.kind === 'bool') return <Switch label={field.label} checked={Boolean(value)} onChange={onChange} />;
  const text = value as string | undefined;
  return (
    <Field label={field.label} hint={field.hint}>
      {field.kind === 'number' && <NumInput value={value as number | undefined} onChange={onChange} placeholder={field.placeholder} />}
      {field.kind === 'text' && <input className="field" value={text ?? ''} onChange={(e) => onChange(e.target.value || undefined)} />}
      {field.kind === 'select' && (
        <select className="field" value={text ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
          {field.choices!.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      )}
      {field.kind === 'list' && (
        <input
          className="field font-mono !text-xs"
          defaultValue={stringifyList(value as ChoiceOption[] | undefined)}
          onBlur={(e) => {
            // keep extra properties (icon, target) of entries that already exist
            const old = new Map(((value as ChoiceOption[] | undefined) || []).map((o) => [String(o.value), o]));
            onChange(parseList(e.target.value).map((o) => ({ ...old.get(o.value), ...o })));
          }}
        />
      )}
    </Field>
  );
}

/**
 * Mowers of the navimow adapter: fills all datapoints of a mower found by the automatic discovery (and the
 * name, if still empty). With several mowers the one whose state is already mapped wins, otherwise a choice
 * is offered. Only this device changes – unlike merging the whole discovery.
 */
function NavimowFill({ d, onFill }: { d: Device; onFill: (m: Device) => void }) {
  const toast = useStore((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const [choices, setChoices] = useState<Device[]>([]);
  const run = async () => {
    setBusy(true);
    try {
      const mowers = (await api.discover()).devices.filter((x) => x.type === 'mower');
      const match = mowers.find((m) => m.states.state === d.states.state);
      if (!mowers.length) toast('Kein Mähroboter des navimow-Adapters gefunden', 'error');
      else if (match || mowers.length === 1) onFill(match ?? mowers[0]);
      else setChoices(mowers);
    } catch (err) {
      toast(`Erkennung fehlgeschlagen: ${(err as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Field label="ioBroker-Adapter navimow" hint="Trägt alle Datenpunkte des Mähers automatisch ein (Karte: im Adapter „mapEnabled“ einschalten).">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={run} disabled={busy}>
          {busy ? <LoaderCircle size={15} className="anim-spin-fast anim-loader" /> : <Download size={15} />} Aus navimow übernehmen
        </button>
        {choices.map((m) => (
          <button key={m.id} type="button" className="chip" onClick={() => { onFill(m); setChoices([]); }}>{m.name}</button>
        ))}
      </div>
    </Field>
  );
}

/** Modal editor working on a local copy; `onSave` receives the device without empty datapoints. */
export function DeviceEditor({ device, rooms, onSave, onClose }: { device: Device; rooms: Room[]; onSave: (d: Device) => void; onClose: () => void }) {
  const [d, setD] = useState<Device>(device);
  const toast = useStore((s) => s.toast);
  const info = DEVICE_TYPES[d.type];
  const missing = info.fields.filter((f) => f.required && !d.states[f.key]);
  const setState = (key: string, id: string) => setD((x) => ({ ...x, states: { ...x.states, [key]: id } }));
  const setOpt = (key: string, v: unknown) => setD((x) => ({ ...x, options: { ...x.options, [key]: v } }));
  const fillMower = (m: Device) => {
    setD((x) => ({ ...x, name: x.name.trim() ? x.name : m.name, states: { ...m.states } }));
    toast(`${Object.keys(m.states).length} Datenpunkte von „${m.name}“ eingetragen`, 'success');
  };

  return (
    <Modal open onClose={onClose} title={device.name ? `Gerät bearbeiten` : 'Neues Gerät'} wide>
      <div className="grid md:grid-cols-2 gap-x-6 gap-y-4">
        <div className="flex flex-col gap-4">
          <Field label="Name"><input className="field" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
          <Field label="Typ">
            {/* a new type uses different datapoints and options, so both are cleared */}
            <select className="field" value={d.type} onChange={(e) => setD({ ...d, type: e.target.value as DeviceType, states: {}, options: {} })}>
              {Object.entries(DEVICE_TYPES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Raum">
            <select className="field" value={d.room} onChange={(e) => setD({ ...d, room: e.target.value })}>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
          <Field label="Symbol (optional)"><IconPicker value={d.icon} onChange={(icon) => setD({ ...d, icon })} /></Field>
          {info.options.map((o) => <OptionInput key={o.key} field={o} value={d.options[o.key]} onChange={(v) => setOpt(o.key, v)} />)}
          {d.type === 'mower' && <NavimowFill d={d} onFill={fillMower} />}
        </div>
        <div className="flex flex-col gap-3">
          <h3 className="section-title">Datenpunkte</h3>
          {info.fields.map((f) => (
            <Field key={f.key} label={`${f.label}${f.required ? ' *' : ''}`} hint={f.hint}>
              <StatePicker value={d.states[f.key] ?? ''} onChange={(id) => setState(f.key, id)} />
            </Field>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-6">
        <button className="btn" onClick={onClose}>Abbrechen</button>
        <button
          className="btn primary"
          disabled={!d.name.trim() || !d.room || missing.length > 0}
          onClick={() => onSave({ ...d, states: Object.fromEntries(Object.entries(d.states).filter(([, v]) => v)) })}
        >
          Übernehmen
        </button>
      </div>
    </Modal>
  );
}
