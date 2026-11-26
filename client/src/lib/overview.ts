/**
 * Derived figures of the whole house for the overview page (both designs): room summaries,
 * averages, open doors / windows, lights that are on, the heat pump. Recomputed when a value changes.
 */
import { useMemo } from 'react';
import { isOn, useStateEntries } from './store';
import { deviceStateIds, groupByRoom, isLightOn, ofType, useDevices, useRooms } from './selectors';
import type { Device, Room, StateEntry } from './types';

/** Room / device names that stand for "outside" (excluded from indoor averages, used for the outside temperature). */
export const OUTSIDE = /außen|aussen|wetter|garten|terrasse/i;

/** Storeys a room can be assigned to (digital twin of the "Nexus" overview). */
export const FLOORS = [
  { value: -1, short: 'KG', label: 'Keller' },
  { value: 0, short: 'EG', label: 'Erdgeschoss' },
  { value: 1, short: 'OG', label: 'Obergeschoss' },
  { value: 2, short: '2. OG', label: '2. Obergeschoss' },
  { value: 3, short: 'DG', label: 'Dachgeschoss' },
];

/** Storey of a room (rooms without one count as ground floor). */
export const floorOf = (r: Room) => (typeof r.floor === 'number' && FLOORS.some((f) => f.value === r.floor) ? r.floor : 0);

/** Numeric value of a datapoint, or null if missing / not a number. */
function valueOf(states: Record<string, StateEntry>, id?: string): number | null {
  const v = id ? states[id]?.val : undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/** A thermostat heats when its valve is open or (without valve) the setpoint is clearly above the room temperature. */
function isHeating(d: Device, states: Record<string, StateEntry>) {
  const cur = valueOf(states, d.states.current);
  const tgt = valueOf(states, d.states.target);
  return (valueOf(states, d.states.valve) ?? 0) > 5 || (cur != null && tgt != null && tgt > cur + 0.3);
}

/** Everything the overview shows about one room. */
export interface RoomSummary {
  room: Room;
  temp: number | null;
  target: number | null;
  humidity: number | null;
  co2: number | null;
  heating: boolean;
  /** On / off state of every lamp of the room. */
  lights: boolean[];
  /** Doors and windows that are open. */
  open: Device[];
  /** A motion or presence sensor of the room reports somebody. */
  presence: boolean;
  /** Number of devices in the room. */
  deviceCount: number;
}

/** One summary per room that has devices (in the configured room order). */
function summarizeRooms(devices: Device[], rooms: Room[], states: Record<string, StateEntry>): RoomSummary[] {
  return groupByRoom(devices, rooms).map(({ room, devices: list }) => {
    const thermos = list.filter((d) => d.type === 'thermostat');
    const sensors = list.filter((d) => d.type === 'sensor');
    const sensorVal = (kind: string) => {
      const s = sensors.find((d) => d.options.kind === kind);
      return s ? valueOf(states, s.states.value) : null;
    };
    const first = (ds: Device[], key: string) => ds.map((d) => valueOf(states, d.states[key])).find((v) => v != null) ?? null;
    const sensorOn = (kinds: string[]) => sensors.filter((d) => kinds.includes(d.options.kind) && isOn(states[d.states.value]?.val));
    return {
      room,
      temp: first(thermos, 'current') ?? first(list.filter((d) => d.type === 'climate'), 'current') ?? sensorVal('temperature'),
      target: first(thermos, 'target'),
      humidity: sensorVal('humidity'),
      co2: sensorVal('co2'),
      heating: thermos.some((d) => isHeating(d, states)),
      lights: list.filter((d) => d.type === 'light').map((d) => isLightOn(d, states)),
      open: sensorOn(['door', 'window']),
      presence: sensorOn(['motion', 'presence']).length > 0,
      deviceCount: list.length,
    };
  });
}

/** Derived figures of the whole house, recomputed when a value of a device changes (energy or weather values do not count). */
export function useOverview() {
  const devices = useDevices();
  const rooms = useRooms();
  const ids = useMemo(() => deviceStateIds(devices), [devices]);
  const states = useStateEntries(ids);
  return useMemo(() => {
    const roomNames = new Map(rooms.map((r) => [r.id, r.name]));
    const roomName = (d: Device) => roomNames.get(d.room) ?? '';
    const sensors = ofType(devices, 'sensor');
    const lights = ofType(devices, 'light');
    const temps = [...ofType(devices, 'thermostat'), ...ofType(devices, 'climate')].map((d) => valueOf(states, d.states.current)).filter((v): v is number => v != null);
    const hums = sensors
      .filter((d) => d.options.kind === 'humidity' && !OUTSIDE.test(`${d.name} ${roomName(d)}`))
      .map((d) => valueOf(states, d.states.value))
      .filter((v): v is number => v != null);
    const outsideSensor =
      sensors.find((d) => d.options.kind === 'temperature' && OUTSIDE.test(`${d.name} ${roomName(d)}`)) ?? sensors.find((d) => d.options.kind === 'temperature');
    const contacts = sensors.filter((d) => ['door', 'window'].includes(d.options.kind)).map((d) => ({ d, open: isOn(states[d.states.value]?.val) }));
    const roomSummaries = summarizeRooms(devices, rooms, states);
    return {
      devices,
      lights,
      lightsOn: lights.filter((d) => isLightOn(d, states)),
      avgTemp: temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null,
      tempCount: temps.length,
      avgHumidity: hums.length ? hums.reduce((a, b) => a + b, 0) / hums.length : null,
      outside: outsideSensor ? valueOf(states, outsideSensor.states.value) : null,
      contacts,
      openContacts: contacts.filter((c) => c.open).map((c) => c.d),
      rooms: roomSummaries,
      heatingRooms: roomSummaries.filter((r) => r.heating).length,
      heatpump: ofType(devices, 'heatpump')[0] as Device | undefined,
    };
  }, [devices, rooms, states]);
}

export type Overview = ReturnType<typeof useOverview>;
