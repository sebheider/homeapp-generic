/** Lights page: lights and plugs, grouped and ordered as configured (default: by room). */
import { useMemo, useState } from 'react';
import { Lightbulb, Power } from 'lucide-react';
import { useStateEntries, useStore } from '../lib/store';
import { Icon } from '../lib/icons';
import { deviceStateIds, isDeviceOn, switchAllOff, useDevices, useRooms } from '../lib/selectors';
import { pageGroups, usePageLayout } from '../lib/layout';
import { DeviceSection } from '../components/DeviceCards';
import { Empty, OpenSettingsButton, PageHeader } from '../components/ui';

/** Every light and switchable plug, with an "only on" filter and an all-off button. */
export function LightsView() {
  const devices = useDevices();
  const rooms = useRooms();
  const layout = usePageLayout('lights');
  const set = useStore((s) => s.set);
  const [onlyOn, setOnlyOn] = useState(false);

  const groups = useMemo(() => pageGroups('lights', devices, rooms, layout), [devices, rooms, layout]);
  const lights = useMemo(() => groups.flatMap((g) => g.devices), [groups]);
  // only the datapoints of these devices are watched, other values do not re-render the page
  const states = useStateEntries(useMemo(() => deviceStateIds(lights), [lights]));
  const on = lights.filter((d) => isDeviceOn(d, states));
  const shown = onlyOn ? groups.map((g) => ({ ...g, devices: g.devices.filter((d) => isDeviceOn(d, states)) })).filter((g) => g.devices.length) : groups;

  return (
    <div>
      <PageHeader title="Licht & Steckdosen" subtitle={`${on.length} von ${lights.length} eingeschaltet`}>
        <button className={`chip ${onlyOn ? 'on' : ''}`} onClick={() => setOnlyOn(!onlyOn)}>
          <Lightbulb size={14} /> Nur eingeschaltete
        </button>
        <button className="btn" disabled={!on.length} onClick={() => switchAllOff(on, set)}><Power size={15} /> Alle aus</button>
      </PageHeader>
      {shown.length === 0 ? (
        <Empty icon={<Lightbulb size={28} />} title={onlyOn ? 'Alles ist aus' : 'Keine Lichter vorhanden'} text={onlyOn ? 'Aktuell ist kein Licht eingeschaltet.' : 'Füge Lichter in den Einstellungen hinzu.'}>
          {!onlyOn && <OpenSettingsButton />}
        </Empty>
      ) : (
        <div className="section-flow">
          {shown.map((g) => <DeviceSection key={g.key} icon={<Icon name={g.icon} size={16} />} title={g.title} devices={g.devices} />)}
        </div>
      )}
    </div>
  );
}
