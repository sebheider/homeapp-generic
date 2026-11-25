/** Settings tab "Kameras": per-camera overrides (name, detector datapoints, pop-ups, hiding) and webhook URLs. */
import { useState } from 'react';
import { Camera, Plus } from 'lucide-react';
import { useStore } from '../../lib/store';
import type { CameraConfig } from '../../lib/types';
import { StatePicker } from '../../components/Pickers';
import { Card, EmptyHint, Field, Switch, WebhookUrls, type TabProps } from './shared';
import { CameraPopupSettings } from './CameraPopupSettings';

/** Lists all known cameras (server list + manually added ids) with their editable overrides. */
export function CamerasTab({ draft, setDraft, webhookToken }: TabProps) {
  const cameras = useStore((s) => s.cameras);
  const [newId, setNewId] = useState('');
  // stored overrides of a camera (ids are compared as strings in case the config holds numeric ids)
  const override = (id: string): CameraConfig => draft.cameras.find((c) => String(c.id) === id) ?? { id };
  const patch = (id: string, p: Partial<CameraConfig>) => {
    const next = { ...override(id), ...p, id };
    const rest = draft.cameras.filter((c) => String(c.id) !== id);
    setDraft({ ...draft, cameras: [...rest, next] });
  };
  // cameras reported by the server plus manually added ones that the server does not know (yet)
  const known = new Map(cameras.map((c) => [c.id, c.name]));
  const ids = [...new Set([...cameras.map((c) => c.id), ...draft.cameras.map((c) => String(c.id))])];
  return (
    <>
      <p className="text-sm text-muted mb-4">Kameras werden direkt aus der Surveillance Station gelesen. Hier kannst du Namen anpassen, Kameras ausblenden und die Bewegungs-Einblendung steuern.</p>
      <CameraPopupSettings draft={draft} setDraft={setDraft} />
      <h3 className="font-semibold mb-3">Einzelne Kameras</h3>
      <div className="glass p-4 mb-4 flex flex-wrap items-end gap-3">
        <Field label="Kamera manuell hinzufügen (Kamera-ID aus der Surveillance Station)" className="flex-1 min-w-48">
          <input className="field" inputMode="numeric" placeholder="z. B. 3" value={newId} onChange={(e) => setNewId(e.target.value.replace(/\D/g, ''))} />
        </Field>
        <button
          className="btn"
          disabled={!newId || ids.includes(newId)}
          onClick={() => {
            patch(newId, { name: `Kamera ${newId}` });
            setNewId('');
          }}
        >
          <Plus size={15} /> Hinzufügen
        </button>
      </div>
      {ids.length === 0 && <EmptyHint>Keine Kameras gefunden. Prüfe die Verbindung zur Surveillance Station oder füge eine Kamera manuell hinzu.</EmptyHint>}
      {ids.map((id) => {
        const o = override(id);
        const name = known.get(id) ?? `Kamera ${id}`;
        return (
          <Card key={id} title={`Kamera ${id}`} right={<Camera size={16} className="text-muted" />}>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Anzeigename"><input className="field" value={o.name ?? name} onChange={(e) => patch(id, { name: e.target.value })} /></Field>
              <div />
              <Field label="ioBroker-Datenpunkt: normale Bewegung (optional)"><StatePicker value={o.motionState ?? ''} onChange={(v) => patch(id, { motionState: v || null })} /></Field>
              <Field label="ioBroker-Datenpunkt: Person / erweiterte Erkennung (optional)"><StatePicker value={o.peopleState ?? ''} onChange={(v) => patch(id, { peopleState: v || null })} /></Field>
            </div>
            {/* `popup` is the camera's master switch; changing one of the kind switches turns it back on */}
            <div className="grid sm:grid-cols-3 gap-x-8 mt-2">
              <Switch label="Einblendung bei Bewegung" checked={o.popup !== false && o.popupMotion !== false} onChange={(v) => patch(id, { popup: true, popupMotion: v })} />
              <Switch label="Einblendung bei Person" checked={o.popup !== false && o.popupPeople !== false} onChange={(v) => patch(id, { popup: true, popupPeople: v })} />
              <Switch label="Kamera ausblenden" checked={Boolean(o.hidden)} onChange={(v) => patch(id, { hidden: v })} />
            </div>
            <div className="mt-3 rounded-2xl border border-line p-3 text-xs text-muted">
              Webhook-URLs für die Aktionsregeln dieser Kamera:
              <WebhookUrls camera={id} token={webhookToken} />
            </div>
          </Card>
        );
      })}
    </>
  );
}
