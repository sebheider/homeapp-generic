/** Settings tab "Benachrichtigungen": user-defined alarms and hints based on datapoint values. */
import { BellPlus, Droplets, DoorOpen, Plus, Thermometer } from 'lucide-react';
import { useStore } from '../../lib/store';
import { ALERT_OPS, NUMERIC_OPS, SEVERITY, TARGET_VIEWS } from '../../lib/alerts';
import { DEVICE_TYPES } from '../../lib/deviceTypes';
import type { AlertOp, AlertRule, Device, Severity } from '../../lib/types';
import { StatePicker } from '../../components/Pickers';
import { Card, DeleteButton, EmptyHint, Field, NumInput, Switch, patchById, uid, type TabProps } from './shared';

/** Templates for the most common notifications (the user picks the sensor afterwards). */
const PRESETS: { label: string; icon: typeof Plus; rule: Partial<AlertRule> }[] = [
  { label: 'Hohe Luftfeuchte', icon: Droplets, rule: { name: 'Luftfeuchte zu hoch', op: '>', value: 65, hysteresis: 3, delaySeconds: 300, severity: 'warning', message: 'Luftfeuchte bei {value} % – bitte lüften', view: 'climate' } },
  { label: 'Niedrige Temperatur', icon: Thermometer, rule: { name: 'Temperatur zu niedrig', op: '<', value: 16, hysteresis: 0.5, delaySeconds: 300, severity: 'warning', message: 'Nur noch {value} °C', view: 'climate' } },
  { label: 'Tür / Fenster offen', icon: DoorOpen, rule: { name: 'Fenster offen', op: 'on', value: '', delaySeconds: 600, severity: 'info', message: 'Das Fenster ist seit 10 Minuten offen', view: 'rooms' } },
];

/** Datapoints of the configured devices as quick choices: "Bad · Luftfeuchte (value)". */
function deviceChoices(devices: Device[], roomName: Map<string, string>) {
  return devices.flatMap((d) =>
    Object.entries(d.states)
      .filter(([, id]) => id)
      .map(([key, id]) => {
        const field = DEVICE_TYPES[d.type]?.fields.find((f) => f.key === key)?.label ?? key;
        return { id, device: d, label: `${roomName.get(d.room) ?? 'Ohne Raum'} · ${d.name} – ${field}` };
      }),
  );
}

/** List of notification rules with an editor per rule. */
export function AlertsTab({ draft, setDraft }: TabProps) {
  // demo mode: the sample devices are only in the live config
  const live = useStore((s) => s.config);
  const demo = useStore((s) => Boolean(s.status?.demo));
  const devices = demo && !draft.devices.length ? live?.devices ?? [] : draft.devices;
  const rooms = demo && !draft.rooms.length ? live?.rooms ?? [] : draft.rooms;
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));
  const choices = deviceChoices(devices, roomName);
  const rules = draft.alerts ?? [];
  const pushover = Boolean(draft.pushover?.enabled);

  const setRules = (alerts: AlertRule[]) => setDraft({ ...draft, alerts });
  const update = (id: string, p: Partial<AlertRule>) => setRules(patchById(rules, id, p));
  const add = (preset: Partial<AlertRule> = {}) => {
    const name = preset.name ?? 'Neue Benachrichtigung';
    const rule: AlertRule = { id: uid(name, rules.map((r) => r.id)), name, enabled: true, state: '', op: '>', value: 0, hysteresis: 0, delaySeconds: 0, severity: 'warning', message: '', view: '', room: '', requireAck: false, ...preset };
    setRules([...rules, rule]);
  };
  /** Takes the datapoint of a device; the room of the device becomes the jump target if none is set. */
  const pickDevice = (r: AlertRule, stateId: string) => {
    const c = choices.find((x) => x.id === stateId);
    if (!c) return;
    update(r.id, { state: stateId, ...(r.view ? {} : { view: 'rooms' }), ...(r.room ? {} : { room: c.device.room }) });
  };

  return (
    <>
      <p className="text-sm text-muted mb-4">
        Benachrichtigungen erscheinen oben in der App (Glocke) und als kurze Einblendung, solange die Bedingung erfüllt ist. Ein Klick darauf springt zum gewählten Bereich. Im Text wird <code>{'{value}'}</code> durch den aktuellen Wert ersetzt. Aufs Handy kommen sie über „Pushover (Handy)“.
      </p>
      <div className="flex flex-wrap gap-2 mb-4">
        <button className="btn primary" onClick={() => add()}><Plus size={16} /> Benachrichtigung</button>
        {PRESETS.map((p) => (
          <button key={p.label} className="btn" onClick={() => add(p.rule)}><p.icon size={15} /> {p.label}</button>
        ))}
      </div>
      {demo && !draft.alerts?.length && <p className="text-xs text-muted mb-3">Im Demo-Modus sind Beispiel-Benachrichtigungen aktiv, solange hier keine eigenen angelegt sind.</p>}
      {rules.length === 0 && <EmptyHint><BellPlus size={22} className="mx-auto mb-2" />Noch keine Benachrichtigungen angelegt.</EmptyHint>}
      {rules.map((r) => {
        const numeric = NUMERIC_OPS.includes(r.op);
        const noValue = r.op === 'on' || r.op === 'off';
        return (
          <Card
            key={r.id}
            title={r.name || 'Benachrichtigung'}
            right={
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: SEVERITY[r.severity].color }} />
                <DeleteButton onClick={() => setRules(rules.filter((x) => x.id !== r.id))} />
              </div>
            }
          >
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Name"><input className="field" value={r.name} onChange={(e) => update(r.id, { name: e.target.value })} /></Field>
              <Field label="Art">
                {/* alarms require acknowledgement by default; changing the type applies that default */}
                <select className="field" value={r.severity} onChange={(e) => update(r.id, { severity: e.target.value as Severity, requireAck: e.target.value === 'alarm' })}>
                  {(Object.keys(SEVERITY) as Severity[]).map((s) => <option key={s} value={s}>{SEVERITY[s].label}</option>)}
                </select>
              </Field>
              {choices.length > 0 && (
                <Field label="Datenpunkt eines Geräts übernehmen" className="sm:col-span-2">
                  <select className="field" value={choices.some((c) => c.id === r.state) ? r.state : ''} onChange={(e) => pickDevice(r, e.target.value)}>
                    <option value="">– Gerät wählen –</option>
                    {choices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </Field>
              )}
              <Field label="ioBroker-Datenpunkt" className="sm:col-span-2"><StatePicker value={r.state} onChange={(v) => update(r.id, { state: v })} /></Field>
              <Field label="Bedingung">
                <select className="field" value={r.op} onChange={(e) => update(r.id, { op: e.target.value as AlertOp })}>
                  {ALERT_OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              {!noValue && (
                <Field label="Grenzwert / Vergleichswert">
                  {numeric ? (
                    <NumInput value={typeof r.value === 'number' ? r.value : Number(r.value) || 0} onChange={(v) => update(r.id, { value: v ?? 0 })} />
                  ) : (
                    <input className="field" value={String(r.value ?? '')} onChange={(e) => update(r.id, { value: e.target.value })} />
                  )}
                </Field>
              )}
              {numeric && (
                <Field label="Hysterese" hint="Erst wenn der Wert um so viel zurückgegangen ist, endet die Benachrichtigung (verhindert Flackern am Grenzwert).">
                  <NumInput value={r.hysteresis} onChange={(v) => update(r.id, { hysteresis: v ?? 0 })} />
                </Field>
              )}
              <Field label="Verzögerung (Sekunden)" hint="Die Bedingung muss so lange erfüllt sein, bevor benachrichtigt wird.">
                <NumInput value={r.delaySeconds} onChange={(v) => update(r.id, { delaySeconds: v ?? 0 })} />
              </Field>
              <Field label="Text" className="sm:col-span-2" hint="Leer = Name und aktueller Wert.">
                <input className="field" value={r.message} placeholder="z. B. Luftfeuchte im Bad bei {value} %" onChange={(e) => update(r.id, { message: e.target.value })} />
              </Field>
              <Field label="Beim Antippen öffnen">
                <select className="field" value={r.view} onChange={(e) => update(r.id, { view: e.target.value })}>
                  {TARGET_VIEWS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                </select>
              </Field>
              {r.view === 'rooms' && (
                <Field label="Raum">
                  <select className="field" value={r.room} onChange={(e) => update(r.id, { room: e.target.value })}>
                    <option value="">Alle Räume</option>
                    {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
                  </select>
                </Field>
              )}
            </div>
            <div className="mt-2 grid sm:grid-cols-2 gap-x-8">
              <Switch label="Aktiv" checked={r.enabled} onChange={(v) => update(r.id, { enabled: v })} />
              <Switch label="Bis zur Quittierung anzeigen" checked={r.requireAck ?? r.severity === 'alarm'} onChange={(v) => update(r.id, { requireAck: v })} />
              {pushover && <Switch label="Per Pushover aufs Handy senden" checked={r.push !== false} onChange={(v) => update(r.id, { push: v })} />}
            </div>
            {(r.requireAck ?? r.severity === 'alarm') && (
              <p className="text-[0.7rem] text-muted mt-1">Bleibt dauerhaft sichtbar (rote Leiste über jeder Seite), bis jemand „Quittieren“ drückt – auch wenn der Auslöser vorher wieder vorbei ist. Die Quittierung gilt für alle Geräte.</p>
            )}
          </Card>
        );
      })}
    </>
  );
}
