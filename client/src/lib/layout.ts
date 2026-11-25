/**
 * Grouping and order of the device pages "Licht", "Klima" and "Räume" (configurable in the settings,
 * stored as `layouts` in the configuration).
 *
 * A page first selects its devices, then groups them according to `groupBy` and finally applies
 * the user's order of groups and devices and hides the devices listed in `hidden`.
 */
import { DEVICE_TYPES, SENSOR_KINDS } from './deviceTypes';
import { useStore } from './store';
import type { Device, GroupMode, LayoutPage, PageLayout, Room } from './types';

/** A titled group of devices on a page. */
export interface DeviceGroup {
  /** Stable key used for the configured group order (room id, type key, ...). */
  key: string;
  title: string;
  /** Icon name of the icon registry (lib/icons.tsx). */
  icon: string;
  devices: Device[];
}

/** Layout used while nothing is configured. */
export const DEFAULT_LAYOUT: PageLayout = { groupBy: 'default', groupOrder: [], deviceOrder: [], hidden: [] };

/** Configured layout of a page (stable reference as long as the config does not change). */
export const usePageLayout = (page: LayoutPage): PageLayout => useStore((s) => s.config?.layouts?.[page] ?? DEFAULT_LAYOUT);

/** Labels of the grouping modes per page (the built-in layout differs between the pages). */
export const GROUP_MODE_LABELS: Record<LayoutPage, Record<GroupMode, string>> = {
  lights: { default: 'Standard (nach Raum)', room: 'Nach Raum', type: 'Nach Gerätetyp', none: 'Keine Gruppen' },
  climate: { default: 'Standard (Systeme, Thermostate nach Raum, Messwerte)', room: 'Nach Raum', type: 'Nach Gerätetyp', none: 'Keine Gruppen' },
  rooms: { default: 'Nach Raum', room: 'Nach Raum', type: 'Nach Gerätetyp', none: 'Keine Gruppen' },
};

/** Sensor kinds shown on the climate page. */
export const CLIMATE_SENSOR_KINDS = ['temperature', 'humidity', 'co2'];

/** The devices that belong on a page (before hiding). */
export function pageDevices(page: LayoutPage, devices: Device[]): Device[] {
  if (page === 'rooms') return devices;
  if (page === 'lights') return devices.filter((d) => d.type === 'light' || d.type === 'switch');
  return devices.filter((d) => d.type === 'heatpump' || d.type === 'climate' || d.type === 'thermostat' || (d.type === 'sensor' && CLIMATE_SENSOR_KINDS.includes(d.options.kind)));
}

/** Type key of a device; sensors are split by their kind (e.g. "sensor:humidity"). */
const typeKey = (d: Device) => (d.type === 'sensor' ? `sensor:${d.options.kind ?? 'generic'}` : d.type);

/** Title and icon of a type group. */
function typeGroup(key: string): { title: string; icon: string } {
  if (key.startsWith('sensor:')) {
    const kind = SENSOR_KINDS[key.slice(7)] ?? SENSOR_KINDS.generic;
    return { title: kind.label, icon: kind.icon };
  }
  const info = DEVICE_TYPES[key as Device['type']];
  return { title: info?.label ?? key, icon: info?.icon ?? 'home' };
}

/** Groups devices by a key; groups appear in the order of their first device. */
function groupBy(devices: Device[], keyOf: (d: Device) => string, describe: (key: string) => { title: string; icon: string }): DeviceGroup[] {
  const groups = new Map<string, DeviceGroup>();
  for (const d of devices) {
    const key = keyOf(d);
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { key, ...describe(key), devices: [] }));
    g.devices.push(d);
  }
  return [...groups.values()];
}

/** Groups by room in the configured room order; devices with an unknown room are still shown. */
function byRoom(devices: Device[], rooms: Room[]): DeviceGroup[] {
  const known = new Map(rooms.map((r) => [r.id, r]));
  const rank = (id: string) => (known.has(id) ? rooms.indexOf(known.get(id)!) : rooms.length);
  const groups = groupBy(devices, (d) => d.room || 'none', (key) => {
    const r = known.get(key);
    return { title: r?.name ?? (key === 'none' ? 'Ohne Raum' : key), icon: r?.icon ?? 'home' };
  });
  return groups.sort((a, b) => rank(a.key) - rank(b.key));
}

/** Built-in layout of a page (what the page looked like before layouts were configurable). */
function defaultGroups(page: LayoutPage, devices: Device[], rooms: Room[]): DeviceGroup[] {
  if (page === 'rooms') return byRoom(devices, rooms);
  if (page === 'lights') return byRoom(devices, rooms);
  const systems = devices.filter((d) => d.type === 'heatpump' || d.type === 'climate');
  const thermostats = devices.filter((d) => d.type === 'thermostat');
  const sensors = devices.filter((d) => d.type === 'sensor');
  return [
    ...(systems.length ? [{ key: 'systems', title: 'Wärmepumpe & Klimaanlagen', icon: 'flame', devices: systems }] : []),
    ...byRoom(thermostats, rooms),
    ...(sensors.length ? [{ key: 'sensors', title: 'Messwerte', icon: 'thermometer', devices: sensors }] : []),
  ];
}

/**
 * Sorts `items` by their position in `order`; items that are not listed keep their relative
 * order and follow after the listed ones.
 */
export function sortByOrder<T>(items: T[], keyOf: (x: T) => string, order: string[]): T[] {
  const pos = new Map(order.map((k, i) => [k, i]));
  const rank = (x: T) => pos.get(keyOf(x)) ?? order.length;
  // Array.prototype.sort is stable, so unlisted items stay in their original order
  return [...items].sort((a, b) => rank(a) - rank(b));
}

/**
 * Groups of a page according to its layout.
 * @param includeHidden true for the settings editor (it lists hidden devices too)
 */
export function pageGroups(page: LayoutPage, allDevices: Device[], rooms: Room[], layout: PageLayout = DEFAULT_LAYOUT, includeHidden = false): DeviceGroup[] {
  const hidden = new Set(page === 'rooms' ? [] : layout.hidden);
  const devices = sortByOrder(
    pageDevices(page, allDevices).filter((d) => includeHidden || !hidden.has(d.id)),
    (d) => d.id,
    layout.deviceOrder,
  );
  let groups: DeviceGroup[];
  if (page === 'rooms' || layout.groupBy === 'room') groups = byRoom(devices, rooms);
  else if (layout.groupBy === 'type') groups = groupBy(devices, typeKey, typeGroup);
  else if (layout.groupBy === 'none') groups = devices.length ? [{ key: 'all', title: 'Alle Geräte', icon: 'home', devices }] : [];
  else groups = defaultGroups(page, devices, rooms);
  return sortByOrder(groups, (g) => g.key, layout.groupOrder);
}

/** True if every device of the group is a large system card (heat pump / air conditioner). */
export const isSystemGroup = (g: DeviceGroup) => g.devices.every((d) => d.type === 'heatpump' || d.type === 'climate');
