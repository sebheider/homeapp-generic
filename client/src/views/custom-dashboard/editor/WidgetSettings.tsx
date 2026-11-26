import { useStore } from '../../../lib/store';
import type { Overview } from '../../../lib/overview';
import { GRID_COLS, MAX_HEIGHT, WIDGETS, WIDGET_PARTS, scalesContent, type GridRect, type Widget, type WidgetOptions } from '../../../lib/widgets';
import { Modal } from '../../../components/ui';
import { Field, NumInput, Switch } from '../../settings/shared';
import { str, ids, useWidgetModules } from '../shared';

/** Settings of one widget: its own options plus exact position and size. */
export function WidgetSettings({ w, o, onChange, onPlace, onClose }: {
  w: Widget; o: Overview; onChange: (options: WidgetOptions) => void; onPlace: (r: GridRect) => void; onClose: () => void;
}) {
  const cameras = useStore((s) => s.cameras);
  const modules = useWidgetModules();
  const setOpt = (p: WidgetOptions) => onChange({ ...w.options, ...p });
  const [minW, minH] = WIDGETS[w.type].min;
  const parts = WIDGET_PARTS[w.type];
  const roomName = new Map(o.rooms.map((r) => [r.room.id, r.room.name]));
  const chosen = ids(w.options.devices);
  return (
    <Modal open onClose={onClose} title={WIDGETS[w.type].label}>
      <div className="grid gap-4">
        {w.type === 'clock' && <Switch label="Statusmeldungen anzeigen" checked={w.options.chips !== false} onChange={(v) => setOpt({ chips: v })} />}
        {w.type === 'energy' && <Switch label="Verlauf der letzten 24 Stunden anzeigen" checked={Boolean(w.options.chart)} onChange={(v) => setOpt({ chart: v })} />}
        {w.type === 'printer' && <Switch label="Webcam-Bild anzeigen" checked={w.options.webcam !== false} onChange={(v) => setOpt({ webcam: v })} />}
        {w.type === 'waste' && (
          <Field label="Anzahl der Abholtage">
            <NumInput value={typeof w.options.count === 'number' ? w.options.count : 4} onChange={(v) => setOpt({ count: Math.min(12, Math.max(1, Math.round(v ?? 4))) })} />
          </Field>
        )}
        {parts && (
          <Field label={parts.label}>
            <select className="field" value={str(w.options[parts.option])} onChange={(e) => setOpt({ [parts.option]: e.target.value })}>
              {parts.parts.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          </Field>
        )}
        {w.type === 'camera' && (
          <Field label="Kamera">
            <select className="field" value={str(w.options.camera) || cameras[0]?.id || ''} onChange={(e) => setOpt({ camera: e.target.value })}>
              {cameras.length === 0 && <option value="">Keine Kameras vorhanden</option>}
              {cameras.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        )}
        {w.type === 'room' && (
          <Field label="Raum">
            <select className="field" value={str(w.options.room) || o.rooms[0]?.room.id || ''} onChange={(e) => setOpt({ room: e.target.value })}>
              {o.rooms.length === 0 && <option value="">Keine Räume vorhanden</option>}
              {o.rooms.map((r) => <option key={r.room.id} value={r.room.id}>{r.room.name}</option>)}
            </select>
          </Field>
        )}
        {w.type === 'extension' && (
          <Field label="Externes Modul" hint="Nur aktivierte Module mit Widget (Einstellungen → Module).">
            <select className="field" value={str(w.options.extension)} onChange={(e) => setOpt({ extension: e.target.value })}>
              <option value="">– bitte wählen –</option>
              {str(w.options.extension) && !modules.some((m) => m.id === str(w.options.extension)) && <option value={str(w.options.extension)}>{str(w.options.extension)} (nicht verfügbar)</option>}
              {modules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
        )}
        {(w.type === 'devices' || w.type === 'text') && (
          <Field label="Überschrift">
            <input className="field" value={str(w.options.title)} maxLength={80} placeholder={w.type === 'devices' ? 'Geräte' : ''} onChange={(e) => setOpt({ title: e.target.value })} />
          </Field>
        )}
        {w.type === 'text' && (
          <Field label="Text">
            <textarea className="field min-h-28" value={str(w.options.text)} maxLength={2000} onChange={(e) => setOpt({ text: e.target.value })} />
          </Field>
        )}
        {(w.type === 'lights' || w.type === 'devices') && (
          <Switch label="Kleine Schalter (Lampen und Schalter nur zum Ein- und Ausschalten)" checked={Boolean(w.options.compact)} onChange={(v) => setOpt({ compact: v })} />
        )}
        {scalesContent({ ...w, options: { ...w.options, scale: true } }) && (
          <Switch label="Inhalt an die Widgetgröße anpassen (wird mit dem Widget größer)" checked={w.options.scale !== false} onChange={(v) => setOpt({ scale: v })} />
        )}
        {w.type === 'devices' && (
          <Field label={`Geräte (${chosen.length} gewählt, in Reihenfolge der Auswahl)`}>
            <div className="max-h-64 overflow-y-auto rounded-xl border border-line divide-y divide-[var(--line)]">
              {o.devices.length === 0 && <p className="p-3 text-sm text-muted">Noch keine Geräte eingerichtet.</p>}
              {o.devices.map((d) => (
                <label key={d.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={chosen.includes(d.id)} onChange={(e) => setOpt({ devices: e.target.checked ? [...chosen, d.id] : chosen.filter((x) => x !== d.id) })} />
                  <span className="flex-1 truncate">{d.name}</span>
                  <span className="text-[0.7rem] text-muted truncate">{roomName.get(d.room) ?? ''}</span>
                </label>
              ))}
            </div>
          </Field>
        )}
        <div>
          <div className="lbl">Position und Größe (in Rasterfeldern)</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="Spalte (1–12)"><NumInput value={w.x + 1} onChange={(v) => v != null && onPlace({ ...w, x: v - 1 })} /></Field>
            <Field label="Zeile"><NumInput value={w.y + 1} onChange={(v) => v != null && onPlace({ ...w, y: v - 1 })} /></Field>
            <Field label={`Breite (${minW}–${GRID_COLS})`}><NumInput value={w.w} onChange={(v) => v != null && onPlace({ ...w, w: Math.min(v, GRID_COLS - w.x) })} /></Field>
            <Field label={`Höhe (${minH}–${MAX_HEIGHT})`}><NumInput value={w.h} onChange={(v) => v != null && onPlace({ ...w, h: v })} /></Field>
          </div>
          <p className="text-[0.7rem] text-muted mt-2">Widgets, die im Weg sind, rutschen nach unten. Auf dem Handy stehen die Widgets untereinander in Lesereihenfolge.</p>
        </div>
        <div className="flex justify-end"><button className="btn primary" onClick={onClose}>Fertig</button></div>
      </div>
    </Modal>
  );
}
