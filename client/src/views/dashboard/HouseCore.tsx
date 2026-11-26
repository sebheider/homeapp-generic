/** State of the house from the notifications and the "Home Core" that shows it. */
import { useStore } from '../../lib/store';
import { useNotifications } from '../../components/Notifications';
import { HomeCore } from '../../components/Hud';
import { C } from './colors';

/** Overall state of the house from the notifications. */
export type HouseState = 'ok' | 'warning' | 'alarm';

/** State of the house from the notifications: colour, label, number of messages and the most important alarm / warning. */
export function useHouseState() {
  const { visible, open, top } = useNotifications();
  const state: HouseState = open.length || top === 'alarm' ? 'alarm' : top === 'warning' ? 'warning' : 'ok';
  const color = state === 'alarm' ? C.alert : state === 'warning' ? C.warm : C.cyan;
  const label = state === 'alarm' ? 'Alarm' : state === 'warning' ? 'Warnung' : 'System OK';
  const sub = visible.length ? `${visible.length} ${visible.length === 1 ? 'Meldung' : 'Meldungen'}` : 'Alles im grünen Bereich';
  // what the alarm / warning is about (alarms waiting for acknowledgement first, see useNotifications)
  const important = state === 'ok' ? [] : open.length ? open : visible.filter((a) => a.severity !== 'info');
  return { state, color, label, sub, alert: important[0] ?? null, more: Math.max(0, important.length - 1) };
}

/** Home Core showing the state of the house; a click opens the notifications. */
export function HouseCore({ size }: { size?: string }) {
  const { state, color, label, sub } = useHouseState();
  const show = useStore((s) => s.showNotifications);
  return (
    <button className="justify-self-center self-center rounded-full" onClick={() => show(true)} aria-label={`Hausstatus: ${label} – Benachrichtigungen öffnen`}>
      <HomeCore color={color} label={label} sub={sub} size={size} state={state} />
    </button>
  );
}
