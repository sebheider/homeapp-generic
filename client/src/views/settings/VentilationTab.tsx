/**
 * Settings tab "Lüftung": thresholds of the ventilation advice, outdoor datapoints and the rooms
 * (humidity / CO₂ / temperature / window per room). Without rooms of its own the server uses every
 * room with a humidity or CO₂ sensor.
 */
import { Plus, Wand2 } from 'lucide-react';
import { autoRooms } from '../../lib/ventilation';
import { useStore } from '../../lib/store';
import type { VentilationConfig, VentilationRoom } from '../../lib/types';
import { StatePicker } from '../../components/Pickers';
import { Toggle } from '../../components/ui';
import { Card, DeleteButton, Field, NumInput, Switch, dimUnless, patchById, uid, type TabProps } from './shared';

export const DEFAULT_VENTILATION: VentilationConfig = {
  enabled: false, outdoor: { temperature: '', humidity: '' }, rooms: [], humidityMax: 60, minDifference: 1,
  co2Max: 1000, co2Warn: 1400, cooling: false, coolAbove: 25, coolDifference: 3, closeHints: true, severity: 'info',
};

const POINTS: { key: keyof Pick<VentilationRoom, 'humidity' | 'co2' | 'temperature' | 'window'>; label: string }[] = [
  { key: 'humidity', label: 'Luftfeuchte (%)' },
  { key: 'temperature', label: 'Temperatur (°C, für die absolute Feuchte)' },
  { key: 'co2', label: 'CO₂ (ppm)' },
  { key: 'window', label: 'Fensterkontakt (optional)' },
];

export function VentilationTab({ draft, setDraft }: TabProps) {
  const v = { ...DEFAULT_VENTILATION, ...draft.ventilation };
  const set = (p: Partial<VentilationConfig>) => setDraft({ ...draft, ventilation: { ...v, ...p } });
  const toast = useStore((s) => s.toast);
  const auto = autoRooms(draft.rooms, draft.devices);
  const roomName = new Map(draft.rooms.map((r) => [r.id, r.name]));
  const weatherStation = Boolean(draft.weather.states?.temperature && draft.weather.states?.humidity);

  const adopt = () => {
    if (!auto.length) return toast('Keine Räume mit Luftfeuchte- oder CO₂-Sensor gefunden', 'error');
    set({ rooms: auto });
    toast(`${auto.length} Räume übernommen – jetzt anpassen und speichern`, 'success');
  };
  const add = () => set({ rooms: [...v.rooms, { id: uid('raum', v.rooms.map((r) => r.id)), room: '', name: '', temperature: '', humidity: '', co2: '', window: '' }] });
  const patch = (id: string, p: Partial<VentilationRoom>) => set({ rooms: patchById(v.rooms, id, p) });

  return (
    <>
      <Card title="Lüftungsempfehlung" right={<Toggle checked={v.enabled} onChange={(x) => set({ enabled: x })} label="Lüftungsempfehlung" />}>
        <p className="text-sm text-muted mb-4">
          Empfiehlt je Raum das Lüften bei hoher Luftfeuchte (nur wenn die Außenluft absolut trockener ist), bei hohem CO₂-Wert
          oder zum Abkühlen – und das Schließen, wenn draußen feuchtere Luft hereinkommt. Hinweise erscheinen im Widget „Lüften“,
          als Status auf der Übersicht und in den Benachrichtigungen.
        </p>
        <div className={`grid sm:grid-cols-2 gap-x-6 gap-y-3 ${dimUnless(v.enabled)}`}>
          <Field label="Luftfeuchte ab (%)" hint="Ab dieser relativen Feuchte im Raum lüften (60 % beugt Schimmel vor)."><NumInput value={v.humidityMax} onChange={(x) => set({ humidityMax: x ?? 60 })} /></Field>
          <Field label="Mindestens trockener außen (g/m³)" hint="So viel weniger Wasser muss die Außenluft je m³ enthalten."><NumInput value={v.minDifference} onChange={(x) => set({ minDifference: x ?? 1 })} /></Field>
          <Field label="CO₂ ab (ppm)" hint="Lüften empfehlen (Richtwert 1000 ppm); CO₂-Ampel gelb."><NumInput value={v.co2Max} onChange={(x) => set({ co2Max: x ?? 1000 })} /></Field>
          <Field label="CO₂ dringend ab (ppm)" hint="Dann als auffälliger Hinweis (Banner); CO₂-Ampel rot."><NumInput value={v.co2Warn} onChange={(x) => set({ co2Warn: x ?? 1400 })} /></Field>
          <Field label="Darstellung">
            <select className="field" value={v.severity} onChange={(e) => set({ severity: e.target.value as VentilationConfig['severity'] })}>
              <option value="info">Nur in den Benachrichtigungen</option>
              <option value="warning">Banner + Meldung (auffällig)</option>
            </select>
          </Field>
          <div className="self-end"><Switch label="„Fenster schließen“, wenn außen feuchter" checked={v.closeHints} onChange={(x) => set({ closeHints: x })} /></div>
          <div className="sm:col-span-2"><Switch label="Zum Abkühlen lüften (Sommer)" checked={v.cooling} onChange={(x) => set({ cooling: x })} /></div>
          <div className={`contents ${v.cooling ? '' : '[&>*]:opacity-50'}`}>
            <Field label="Raum wärmer als (°C)"><NumInput value={v.coolAbove} onChange={(x) => set({ coolAbove: x ?? 25 })} /></Field>
            <Field label="Außen mindestens kühler um (K)"><NumInput value={v.coolDifference} onChange={(x) => set({ coolDifference: x ?? 3 })} /></Field>
          </div>
        </div>
      </Card>

      <Card title="Außenluft">
        <div className={`grid sm:grid-cols-2 gap-4 ${dimUnless(v.enabled)}`}>
          <p className="text-xs text-muted sm:col-span-2">
            Leer lassen: {weatherStation ? 'Werte der eingerichteten Wetterstation' : 'Wetterstation (falls eingerichtet), sonst das Internet-Wetter des Standorts'}.
          </p>
          <Field label="Außentemperatur"><StatePicker value={v.outdoor.temperature} onChange={(x) => set({ outdoor: { ...v.outdoor, temperature: x } })} /></Field>
          <Field label="Außen-Luftfeuchte"><StatePicker value={v.outdoor.humidity} onChange={(x) => set({ outdoor: { ...v.outdoor, humidity: x } })} /></Field>
        </div>
      </Card>

      <Card
        title="Räume"
        right={
          <div className="flex gap-2">
            <button className="btn !py-1 !text-xs" onClick={adopt}><Wand2 size={13} /> Aus Geräten übernehmen</button>
            <button className="btn !py-1 !text-xs" onClick={add}><Plus size={13} /> Raum</button>
          </div>
        }
      >
        <div className={dimUnless(v.enabled)}>
          <p className="text-xs text-muted mb-3">Wanddisplays mit CO₂-Sensor (Kiosk-Agent) sind automatisch mit ihrem Namen dabei – außer ihr CO₂-Datenpunkt ist bereits einem Raum zugeordnet.</p>
          {v.rooms.length === 0 ? (
            <div className="text-sm">
              <p className="text-muted mb-2">Automatisch: alle Räume mit Luftfeuchte- oder CO₂-Sensor.</p>
              {auto.length === 0 ? <p className="text-amber-400 text-xs">Zurzeit keine passenden Sensoren eingerichtet.</p> : (
                <ul className="text-xs grid gap-1">
                  {auto.map((r) => <li key={r.id}><b>{roomName.get(r.room) ?? r.room}</b> <span className="text-muted">– {[r.humidity && 'Feuchte', r.temperature && 'Temperatur', r.co2 && 'CO₂', r.window && 'Fenster'].filter(Boolean).join(', ')}</span></li>)}
                </ul>
              )}
            </div>
          ) : (
            <ul className="grid gap-4">
              {v.rooms.map((r) => (
                <li key={r.id} className="rounded-xl border border-line p-3">
                  <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end mb-3">
                    <Field label="Raum">
                      <select className="field" value={r.room} onChange={(e) => patch(r.id, { room: e.target.value })}>
                        <option value="">– ohne Raum –</option>
                        {draft.rooms.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Anzeigename (optional)">
                      <input className="field" value={r.name} maxLength={60} placeholder={roomName.get(r.room) ?? ''} onChange={(e) => patch(r.id, { name: e.target.value })} />
                    </Field>
                    <DeleteButton onClick={() => set({ rooms: v.rooms.filter((x) => x.id !== r.id) })} />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {POINTS.map((p) => (
                      <Field key={p.key} label={p.label}><StatePicker value={r[p.key]} onChange={(x) => patch(r.id, { [p.key]: x })} /></Field>
                    ))}
                  </div>
                  {!r.humidity && !r.co2 && <p className="text-xs text-amber-400 mt-2">Ohne Luftfeuchte oder CO₂ wird der Raum beim Speichern verworfen.</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </>
  );
}
