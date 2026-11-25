/** Settings tab "Räume": add, rename, reorder and delete rooms, pick their icons and storeys. */
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Icon } from '../../lib/icons';
import { FLOORS, floorOf } from '../../lib/overview';
import type { Room } from '../../lib/types';
import { IconPicker } from '../../components/Pickers';
import { DeleteButton, EmptyHint, patchById, uid, type TabProps } from './shared';
import { SortableList } from './SortableList';

/** Ordered room list; the order is used everywhere rooms are listed. */
export function RoomsTab({ draft, setDraft }: TabProps) {
  // room whose icon picker is open
  const [iconFor, setIconFor] = useState<string | null>(null);
  const update = (id: string, p: Partial<Room>) => setDraft({ ...draft, rooms: patchById(draft.rooms, id, p) });
  const addRoom = () => setDraft({ ...draft, rooms: [...draft.rooms, { id: uid('raum', draft.rooms.map((r) => r.id)), name: 'Neuer Raum', icon: 'home' }] });
  return (
    <>
      <div className="flex items-center justify-between gap-4 mb-4">
        <p className="text-xs text-muted">Räume am Griff in die gewünschte Reihenfolge ziehen – auch per Touch. Die Etage bestimmt die Position im Design „Nexus“.</p>
        <button className="btn primary shrink-0" onClick={addRoom}><Plus size={16} /> Raum</button>
      </div>
      {draft.rooms.length === 0 && <EmptyHint>Noch keine Räume vorhanden. Lege deinen ersten Raum an.</EmptyHint>}
      <SortableList items={draft.rooms} itemKey={(r) => r.id} itemLabel={(r) => r.name} label="Reihenfolge der Räume"
        onReorder={(rooms) => setDraft({ ...draft, rooms })} className="glass divide-y divide-[var(--line)]" itemClassName="px-3 sm:px-4 py-3"
      >
        {(r, handle) => (
          <>
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
              {handle}
              <button className="icon-bubble !w-10 !h-10 on" onClick={() => setIconFor(iconFor === r.id ? null : r.id)} aria-label="Symbol wählen"><Icon name={r.icon} size={18} /></button>
              <input className="field flex-1 min-w-0" aria-label="Raumname" value={r.name} onChange={(e) => update(r.id, { name: e.target.value })} />
              {/* phones: storey in a second line below the name */}
              <select className="field shrink-0 order-last sm:order-none basis-[calc(100%-3rem)] ml-12 sm:ml-0 sm:basis-auto sm:!w-auto" value={floorOf(r)} onChange={(e) => update(r.id, { floor: Number(e.target.value) })} aria-label="Etage" title="Etage">
                {FLOORS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
              <span className="text-xs text-muted hidden lg:block w-20 truncate">{draft.devices.filter((d) => d.room === r.id).length} Geräte</span>
              <DeleteButton onClick={() => setDraft({ ...draft, rooms: draft.rooms.filter((x) => x.id !== r.id) })} />
            </div>
            {iconFor === r.id && <div className="mt-3"><IconPicker value={r.icon} onChange={(icon) => update(r.id, { icon })} /></div>}
          </>
        )}
      </SortableList>
    </>
  );
}
