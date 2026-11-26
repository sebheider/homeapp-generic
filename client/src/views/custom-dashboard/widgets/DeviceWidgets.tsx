/** Widgets with device cards: the lights that are on and a chosen list of devices. */
import { Power } from 'lucide-react';
import { useStore } from '../../../lib/store';
import type { Device } from '../../../lib/types';
import { switchAllOff } from '../../../lib/selectors';
import type { Overview } from '../../../lib/overview';
import type { Widget } from '../../../lib/widgets';
import { DeviceCardSized } from '../../../components/DeviceCards';
import { HudPanel } from '../../../components/Hud';
import { C } from '../../dashboard/colors';
import { str, ids } from '../shared';
import { WidgetNote } from './WidgetNote';

/** Light and switch tiles in the chosen size; with `small` the small tiles come first in their own denser grid. */
function DeviceGrid({ devices, small }: { devices: Device[]; small: boolean }) {
  if (!small) return <div className="grid-cards">{devices.map((d) => <DeviceCardSized key={d.id} device={d} small={false} />)}</div>;
  const isSmall = (d: Device) => d.type === 'light' || d.type === 'switch';
  const tiles = devices.filter(isSmall);
  const cards = devices.filter((d) => !isSmall(d));
  return (
    <>
      {tiles.length > 0 && <div className="grid-switches">{tiles.map((d) => <DeviceCardSized key={d.id} device={d} small />)}</div>}
      {cards.length > 0 && <div className={`grid-cards ${tiles.length ? 'mt-3' : ''}`}>{cards.map((d) => <DeviceCardSized key={d.id} device={d} small={false} />)}</div>}
    </>
  );
}

/** The lights and plugs that are on, with an "Alle aus" button. */
export function LightsWidget({ o, small }: { o: Overview; small: boolean }) {
  const set = useStore((s) => s.set);
  return (
    <HudPanel
      title="Eingeschaltet"
      color={C.amber}
      right={o.lightsOn.length > 0 && <button className="btn !py-1 !text-xs" onClick={() => switchAllOff(o.lightsOn, set)}><Power size={12} /> Alle aus</button>}
    >
      {o.lightsOn.length ? (
        <DeviceGrid devices={o.lightsOn} small={small} />
      ) : (
        <p className="text-sm text-muted">{o.lights.length ? 'Alle Lichter sind aus.' : 'Keine Lichter eingerichtet.'}</p>
      )}
    </HudPanel>
  );
}

/** The devices chosen in the widget settings (`devices` option) under an own title. */
export function DevicesWidget({ o, w }: { o: Overview; w: Widget }) {
  const byId = new Map(o.devices.map((d) => [d.id, d]));
  const devices = ids(w.options.devices).map((id) => byId.get(id)).filter((d) => d != null);
  const title = str(w.options.title) || 'Geräte';
  if (!devices.length) return <WidgetNote type="devices" title={title} text="Noch keine Geräte gewählt (⚙ beim Bearbeiten)." />;
  return (
    <HudPanel title={title} color={C.violet}>
      <DeviceGrid devices={devices} small={Boolean(w.options.compact)} />
    </HudPanel>
  );
}
