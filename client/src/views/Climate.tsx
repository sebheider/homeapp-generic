/** Climate page: heating and cooling devices plus room climate sensors, grouped and ordered as configured. */
import { Flame } from 'lucide-react';
import { Icon } from '../lib/icons';
import { useDevices, useRooms } from '../lib/selectors';
import { isSystemGroup, pageGroups, usePageLayout } from '../lib/layout';
import { DeviceSection } from '../components/DeviceCards';
import { Empty, OpenSettingsButton, PageHeader } from '../components/ui';

/** Heat pump, air conditioners, radiator thermostats and temperature / humidity / CO₂ sensors. */
export function ClimateView() {
  const devices = useDevices();
  const rooms = useRooms();
  const layout = usePageLayout('climate');
  const groups = pageGroups('climate', devices, rooms, layout);
  const shown = groups.flatMap((g) => g.devices);

  if (!shown.length) {
    return (
      <div>
        <PageHeader title="Klima & Heizung" />
        <Empty icon={<Flame size={28} />} title="Keine Heizgeräte vorhanden" text="Thermostate, Klimaanlagen und die Wärmepumpe kannst du in den Einstellungen hinzufügen.">
          <OpenSettingsButton />
        </Empty>
      </div>
    );
  }

  const thermostats = shown.filter((d) => d.type === 'thermostat').length;
  const systems = shown.filter((d) => d.type === 'heatpump' || d.type === 'climate').length;
  return (
    <div>
      <PageHeader title="Klima & Heizung" subtitle={`${thermostats} Thermostate · ${systems} Systeme`} />
      {/* groups of heat pumps / air conditioners use the wider grid for their larger cards */}
      <div className="section-flow">
        {groups.map((g) => <DeviceSection key={g.key} icon={<Icon name={g.icon} size={16} />} title={g.title} devices={g.devices} wide={isSystemGroup(g)} />)}
      </div>
    </div>
  );
}
