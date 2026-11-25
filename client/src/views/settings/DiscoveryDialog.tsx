/** Dialog that runs the automatic ioBroker discovery and merges (or replaces) the result into the draft. */
import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { api, type Discovery } from '../../lib/api';
import { useStore } from '../../lib/store';
import { DEVICE_TYPES } from '../../lib/deviceTypes';
import type { AppConfig, DeviceType } from '../../lib/types';
import { Modal } from '../../components/ui';
import { Switch } from './shared';

/** Merges two lists by id; entries of `add` win over existing ones with the same id. */
const mergeById = <T extends { id: string }>(old: T[], add: T[]) => {
  const m = new Map(old.map((x) => [x.id, x]));
  for (const x of add) m.set(x.id, x);
  return [...m.values()];
};

/** Shows what the discovery found and applies it to the draft (not saved yet). */
export function DiscoveryDialog({ draft, setDraft, onClose }: { draft: AppConfig; setDraft: (c: AppConfig) => void; onClose: () => void }) {
  const toast = useStore((s) => s.toast);
  const [found, setFound] = useState<Discovery | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replace, setReplace] = useState(false);

  useEffect(() => {
    api.discover().then(setFound).catch((e: Error) => setError(e.message));
  }, []);

  const apply = () => {
    if (!found) return;
    setDraft({
      ...draft,
      rooms: replace ? found.rooms : mergeById(draft.rooms, found.rooms),
      devices: replace ? found.devices : mergeById(draft.devices, found.devices),
      scenes: replace ? found.scenes : mergeById(draft.scenes, found.scenes),
      energy: found.energy ?? draft.energy,
      // weather datapoints mapped by hand win over discovered ones
      weather: found.weather ? { ...draft.weather, states: { ...found.weather.states, ...draft.weather.states } } : draft.weather,
    });
    toast('Erkannte Geräte übernommen – jetzt speichern', 'success');
    onClose();
  };

  // number of found devices per type
  const types = found ? Object.entries(found.devices.reduce<Record<string, number>>((a, d) => ({ ...a, [d.type]: (a[d.type] ?? 0) + 1 }), {})) : [];

  return (
    <Modal open onClose={onClose} title="Automatische Erkennung">
      {error && <p className="text-rose-400 text-sm">{error}</p>}
      {!error && !found && <p className="text-muted text-sm">Durchsuche ioBroker … das kann einen Moment dauern.</p>}
      {found && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">Gefunden wurden {found.devices.length} Geräte in {found.rooms.length} Räumen, {found.scenes.length} Szenen{found.energy ? ' und ein Energiesystem' : ''}.</p>
          <div className="flex flex-wrap gap-2">
            {types.map(([t, n]) => <span key={t} className="chip">{DEVICE_TYPES[t as DeviceType]?.label ?? t}: {n}</span>)}
          </div>
          <Switch label="Bestehende Konfiguration ersetzen (sonst werden Einträge ergänzt)" checked={replace} onChange={setReplace} />
          <p className="text-xs text-muted">Die Vorschläge werden erst nach dem Speichern aktiv. Namen und Räume kannst du danach beliebig anpassen.</p>
          <div className="flex justify-end gap-2">
            <button className="btn" onClick={onClose}>Abbrechen</button>
            <button className="btn primary" onClick={apply}><Download size={15} /> Übernehmen</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
