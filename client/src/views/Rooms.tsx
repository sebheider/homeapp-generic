/** Rooms page: all devices grouped by room. */
import { Home } from 'lucide-react';
import { useStore } from '../lib/store';
import { Icon } from '../lib/icons';
import { useDevices, useRooms } from '../lib/selectors';
import { pageGroups, usePageLayout } from '../lib/layout';
import { DeviceSection } from '../components/DeviceCards';
import { Empty, OpenSettingsButton, PageHeader } from '../components/ui';

/** All devices grouped by room, with a chip bar to focus on a single room. */
export function RoomsView() {
  const devices = useDevices();
  const rooms = useRooms();
  const layout = usePageLayout('rooms');
  const filter = useStore((s) => s.roomFilter);
  const setView = useStore((s) => s.setView);
  const groups = pageGroups('rooms', devices, rooms, layout);
  const shown = filter ? groups.filter((g) => g.key === filter) : groups;

  return (
    <div>
      <PageHeader title="Räume" subtitle={`${groups.length} ${groups.length === 1 ? 'Raum' : 'Räume'} · ${devices.length} ${devices.length === 1 ? 'Gerät' : 'Geräte'}`} />
      {groups.length === 0 ? (
        <Empty icon={<Home size={28} />} title="Keine Räume vorhanden" text="Lege Räume und Geräte in den Einstellungen an oder nutze die automatische Erkennung.">
          <OpenSettingsButton />
        </Empty>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto no-scrollbar md:flex-wrap md:overflow-visible pb-3 -mx-1 px-1">
            <button className={`chip ${!filter ? 'on' : ''}`} onClick={() => setView('rooms', null)}>Alle</button>
            {groups.map((g) => (
              <button key={g.key} className={`chip ${filter === g.key ? 'on' : ''}`} onClick={() => setView('rooms', g.key)}>
                <Icon name={g.icon} size={14} /> {g.title}
              </button>
            ))}
          </div>
          {/* the key restarts the entrance animation when the room filter changes */}
          <div className="section-flow">
            {shown.map((g) => <DeviceSection key={g.key + (filter ?? '')} icon={<Icon name={g.icon} size={16} />} title={g.title} devices={g.devices} showCount />)}
          </div>
        </>
      )}
    </div>
  );
}
