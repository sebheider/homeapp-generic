/** Settings tab "Seiten": grouping, order and visibility of the devices on the pages "Licht" and "Klima". */
import { useState } from 'react';
import { Eye, EyeOff, RotateCcw } from 'lucide-react';
import { Icon } from '../../lib/icons';
import { useStore } from '../../lib/store';
import { DEVICE_TYPES } from '../../lib/deviceTypes';
import { DEFAULT_LAYOUT, GROUP_MODE_LABELS, pageGroups } from '../../lib/layout';
import type { GroupMode, LayoutPage, PageLayout } from '../../lib/types';
import { Card, EmptyHint, Field, toggleItem, type TabProps } from './shared';
import { SortableList } from './SortableList';

const PAGES: { id: LayoutPage; label: string }[] = [
  { id: 'lights', label: 'Licht' },
  { id: 'climate', label: 'Klima' },
  { id: 'rooms', label: 'Räume' },
];

/** Layouts of all pages with defaults (for configs saved before layouts existed). */
const DEFAULT_LAYOUTS: Record<LayoutPage, PageLayout> = { lights: DEFAULT_LAYOUT, climate: DEFAULT_LAYOUT, rooms: DEFAULT_LAYOUT };

/** Editor for the layouts of the device pages; changes are previewed exactly as the page will show them. */
export function LayoutTab({ draft, setDraft }: TabProps) {
  const [page, setPage] = useState<LayoutPage>('lights');
  // demo mode: the editor holds no devices, the sample installation is only in the live config
  const live = useStore((s) => s.config);
  const demo = useStore((s) => Boolean(s.status?.demo));
  const devices = demo && !draft.devices.length ? live?.devices ?? [] : draft.devices;
  const rooms = demo && !draft.rooms.length ? live?.rooms ?? [] : draft.rooms;
  const layout: PageLayout = draft.layouts?.[page] ?? DEFAULT_LAYOUT;
  const setLayout = (p: Partial<PageLayout>) => setDraft({ ...draft, layouts: { ...DEFAULT_LAYOUTS, ...draft.layouts, [page]: { ...layout, ...p } } });
  // the editor lists hidden devices too (greyed out), so they can be shown again
  const groups = pageGroups(page, devices, rooms, layout, true);
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));

  return (
    <>
      <p className="text-sm text-muted mb-4">
        Lege fest, wie die Geräte auf den Seiten <i>Licht</i>, <i>Klima</i> und <i>Räume</i> gruppiert und sortiert werden. Ausgeblendete Geräte erscheinen nur auf der jeweiligen Licht- oder Klimaseite. Die Reihenfolge der Räume selbst legst du unter <i>Räume</i> fest; hier kannst du sie pro Seite abweichend sortieren.
      </p>
      <p className="text-sm text-muted mb-4">{page === 'rooms' ? 'Räume am Griff im Titel verschieben, Geräte am eigenen Griff innerhalb des Raums sortieren.' : 'Gruppen am Griff im Titel verschieben, Geräte am eigenen Griff innerhalb ihrer Gruppe sortieren. Die Raumzuordnung bleibt dabei unverändert.'}</p>
      <div className="flex gap-2 mb-4">
        {PAGES.map((p) => <button key={p.id} className={`chip ${page === p.id ? 'on' : ''}`} onClick={() => setPage(p.id)}>{p.label}</button>)}
      </div>
      <Card
        title={`Seite „${PAGES.find((p) => p.id === page)!.label}“`}
        right={<button className="btn !py-1.5 !text-xs" onClick={() => setLayout({ ...DEFAULT_LAYOUT })}><RotateCcw size={13} /> Zurücksetzen</button>}
      >
        {page !== 'rooms' && <Field label="Gruppierung" className="max-w-md">
          <select className="field" value={layout.groupBy} onChange={(e) => setLayout({ groupBy: e.target.value as GroupMode, groupOrder: [] })}>
            {(Object.keys(GROUP_MODE_LABELS[page]) as GroupMode[]).map((m) => <option key={m} value={m}>{GROUP_MODE_LABELS[page][m]}</option>)}
          </select>
        </Field>}
      </Card>
      {groups.length === 0 && <EmptyHint>Für diese Seite sind noch keine passenden Geräte angelegt.</EmptyHint>}
      <SortableList key={`${page}-${layout.groupBy}`} items={groups} itemKey={(g) => g.key} itemLabel={(g) => g.title} label="Reihenfolge der Gruppen"
        onReorder={(next) => setLayout({ groupOrder: next.map((g) => g.key) })} itemClassName="glass mb-3"
      >
        {(g, groupHandle) => (
          <>
          <div className="flex items-center gap-2 px-4 py-3 border-b border-line">
            {groupHandle}
            <div className="icon-bubble on tone-violet !w-8 !h-8"><Icon name={g.icon} size={16} /></div>
            <h3 className="font-semibold flex-1 truncate">{g.title}</h3>
          </div>
          <SortableList items={g.devices} itemKey={(d) => d.id} itemLabel={(d) => d.name} label={`Geräte in ${g.title}`}
            onReorder={(devices) => setLayout({ deviceOrder: groups.flatMap((group) => group.key === g.key ? devices : group.devices).map((d) => d.id) })}
            className="divide-y divide-[var(--line)]"
          >
            {(d, deviceHandle) => {
              const hidden = layout.hidden.includes(d.id);
              return (
                <div className={`flex items-center gap-2 px-4 py-2 ${hidden ? 'opacity-50' : ''}`}>
                  {deviceHandle}
                  <Icon name={d.icon ?? DEVICE_TYPES[d.type]?.icon ?? 'home'} size={16} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{d.name}</div>
                    <div className="text-[0.7rem] text-muted truncate">{roomName.get(d.room) ?? 'Ohne Raum'}</div>
                  </div>
                  {page !== 'rooms' && <button className="btn btn-icon" onClick={() => setLayout({ hidden: toggleItem(layout.hidden, d.id) })} aria-label={hidden ? 'Einblenden' : 'Ausblenden'} title={hidden ? 'Einblenden' : 'Auf dieser Seite ausblenden'}>
                    {hidden ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>}
                </div>
              );
            }}
          </SortableList>
          </>
        )}
      </SortableList>
    </>
  );
}
