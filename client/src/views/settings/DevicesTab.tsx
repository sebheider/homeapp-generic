/** Settings tab "Geräte": filterable device list with editor and automatic discovery. */
import { useState } from 'react';
import { Pencil, Plus, ScanSearch } from 'lucide-react';
import { useStore } from '../../lib/store';
import { DEVICE_TYPES } from '../../lib/deviceTypes';
import { Icon } from '../../lib/icons';
import type { Device } from '../../lib/types';
import { DeleteButton, EmptyHint, uid, type TabProps } from './shared';
import { DeviceEditor } from './DeviceEditor';
import { DiscoveryDialog } from './DiscoveryDialog';

/** Device list with filter, "add" button, editor dialog and discovery dialog. */
export function DevicesTab({ draft, setDraft }: TabProps) {
  const [editing, setEditing] = useState<{ device: Device; isNew: boolean } | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [q, setQ] = useState('');
  // the discovery needs a live ioBroker connection
  const connected = useStore((s) => s.status?.source.connected && !s.status.demo);

  const roomOf = (id: string) => draft.rooms.find((r) => r.id === id);
  // the filter matches name, type and room name
  const list = draft.devices.filter((d) => `${d.name} ${d.type} ${roomOf(d.room)?.name ?? ''}`.toLowerCase().includes(q.toLowerCase()));

  /** Replaces an existing device (same id) or appends a new one. */
  const save = (d: Device) => {
    const exists = draft.devices.some((x) => x.id === d.id);
    setDraft({ ...draft, devices: exists ? draft.devices.map((x) => (x.id === d.id ? d : x)) : [...draft.devices, d] });
    setEditing(null);
  };

  const addDevice = () =>
    setEditing({ isNew: true, device: { id: uid('geraet', draft.devices.map((d) => d.id)), type: 'light', name: '', room: draft.rooms[0].id, states: {}, options: {} } });

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-4">
        <input className="field !w-auto flex-1 min-w-40" placeholder="Geräte filtern …" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" disabled={!connected} title={connected ? '' : 'Benötigt eine Live-Verbindung zum ioBroker'} onClick={() => setDiscovering(true)}><ScanSearch size={16} /> Automatisch erkennen</button>
        <button className="btn primary" disabled={draft.rooms.length === 0} title={draft.rooms.length === 0 ? 'Lege zuerst einen Raum an' : ''} onClick={addDevice}>
          <Plus size={16} /> Gerät
        </button>
      </div>
      {draft.devices.length === 0 && <EmptyHint>Noch keine Geräte. Nutze „Automatisch erkennen“ oder füge Geräte manuell hinzu.</EmptyHint>}
      <div className="glass divide-y divide-[var(--line)]">
        {list.map((d) => (
          <div key={d.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="icon-bubble !w-9 !h-9"><Icon name={d.icon || DEVICE_TYPES[d.type].icon} size={17} /></div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{d.name}</div>
              <div className="text-xs text-muted truncate">{DEVICE_TYPES[d.type].label} · {roomOf(d.room)?.name ?? d.room}</div>
            </div>
            {/* the editor works on a copy so that "Abbrechen" discards the changes */}
            <button className="btn btn-icon" onClick={() => setEditing({ device: structuredClone(d), isNew: false })} aria-label="Bearbeiten"><Pencil size={15} /></button>
            <DeleteButton onClick={() => setDraft({ ...draft, devices: draft.devices.filter((x) => x.id !== d.id) })} />
          </div>
        ))}
      </div>
      {editing && <DeviceEditor device={editing.device} rooms={draft.rooms} onSave={save} onClose={() => setEditing(null)} />}
      {discovering && <DiscoveryDialog draft={draft} setDraft={setDraft} onClose={() => setDiscovering(false)} />}
    </>
  );
}
