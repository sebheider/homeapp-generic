/**
 * Store selectors and pure helpers that derive information from the device configuration
 * (filtering by type, grouping by room, on/off state of lights).
 */
import { isOn, useStore } from './store';
import { toNum } from './format';
import type { Device, DeviceType, Room } from './types';

const EMPTY_DEVICES: Device[] = [];
const EMPTY_ROOMS: Room[] = [];

/** All configured devices (stable reference as long as the config does not change). */
export const useDevices = (): Device[] => useStore((s) => s.config?.devices ?? EMPTY_DEVICES);
/** All configured rooms in their configured order (stable reference). */
export const useRooms = (): Room[] => useStore((s) => s.config?.rooms ?? EMPTY_ROOMS);

/** Devices of one or more types, in configuration order. */
export const ofType = (devices: Device[], ...types: DeviceType[]) => devices.filter((d) => types.includes(d.type));

/** Groups devices by room id, preserving the order of the configured rooms. */
export function groupByRoom(devices: Device[], rooms: Room[]) {
  const known = new Map(rooms.map((r) => [r.id, r]));
  const groups = new Map<string, { room: Room; devices: Device[] }>();
  for (const r of rooms) groups.set(r.id, { room: r, devices: [] });
  for (const d of devices) {
    let g = groups.get(d.room);
    if (!g) {
      // devices that reference an unknown room are still shown
      const room = known.get(d.room) ?? { id: d.room || 'none', name: d.room || 'Ohne Raum', icon: 'home' };
      g = { room, devices: [] };
      groups.set(room.id, g);
    }
    g.devices.push(d);
  }
  return [...groups.values()].filter((g) => g.devices.length > 0);
}

/**
 * Whether a light is on. Devices with an on/off datapoint use it; dimmer-only
 * devices count as on while their brightness is above zero.
 */
export function isLightOn(d: Device, states: Record<string, { val: unknown }>) {
  if (d.states.power) return isOn(states[d.states.power]?.val);
  // same rule as the light card: numeric strings ("40") count as well
  return toNum(states[d.states.brightness]?.val) > 0;
}

/** Whether a light or a plug / switch is on (the meaning used by the lights page and its "all off" button). */
export const isDeviceOn = (d: Device, states: Record<string, { val: unknown }>) =>
  d.type === 'light' ? isLightOn(d, states) : isOn(states[d.states.power]?.val);

/** All datapoint ids of the given devices (to subscribe only to them, see `useStateEntries`). */
export const deviceStateIds = (devices: Device[]) => [...new Set(devices.flatMap((d) => Object.values(d.states ?? {}).filter(Boolean)))];

/** Switches lights / plugs off: via the on/off datapoint, or for dimmer-only lights by setting the brightness to 0. */
export function switchAllOff(devices: Device[], set: (id: string | undefined, value: unknown) => void) {
  devices.forEach((d) => (d.states.power ? set(d.states.power, false) : set(d.states.brightness, 0)));
}
