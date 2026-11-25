/**
 * Helpers for the ventilation advice (computed by the server, see server ventilation.js).
 */
import type { Device, Room, VentilationRoom, VentilationRoomState } from './types';

/** Label and colour of a room status. */
export const VENT_STATUS: Record<VentilationRoomState['status'], { label: string; color: string }> = {
  ventilate: { label: 'Lüften', color: '#fbbf24' },
  airing: { label: 'Wird gelüftet', color: '#22d3ee' },
  close: { label: 'Fenster schließen', color: '#fb923c' },
  ok: { label: 'Gut', color: '#34d399' },
  unknown: { label: 'Keine Werte', color: '#64748b' },
};

/** Short reason texts. */
export const VENT_REASON: Record<string, string> = {
  co2: 'CO₂ hoch',
  humidity: 'zu feucht',
  cooling: 'abkühlen',
  humidOutside: 'außen feuchter',
};

/** Rooms that should be aired now (most urgent first: warning before info, then CO₂). */
export function roomsToVentilate(rooms: VentilationRoomState[]): VentilationRoomState[] {
  const rank = (r: VentilationRoomState) => (r.severity === 'warning' ? 0 : 1) * 10 + (r.reasons.includes('co2') ? 0 : 1);
  return rooms.filter((r) => r.status === 'ventilate').sort((a, b) => rank(a) - rank(b));
}

/** Text of the overview chip: "Lüften: Büro, Bad" (at most `max` names). */
export function ventilateText(rooms: VentilationRoomState[], max = 2): string {
  const names = rooms.map((r) => r.name);
  return `Lüften: ${names.slice(0, max).join(', ')}${names.length > max ? ` +${names.length - max}` : ''}`;
}

const OUTSIDE = /außen|aussen|wetter|garten|terrasse|balkon/i;

/**
 * Rooms derived from the devices (same rule as the server's autoRooms): every room with a humidity
 * or CO₂ sensor; temperature from a sensor or the current value of a thermostat. Outdoor rooms are skipped.
 */
export function autoRooms(rooms: Room[], devices: Device[]): VentilationRoom[] {
  const out: VentilationRoom[] = [];
  for (const room of rooms) {
    if (OUTSIDE.test(`${room.id} ${room.name}`)) continue;
    const devs = devices.filter((d) => d.room === room.id);
    const sensor = (kind: string) => devs.find((d) => d.type === 'sensor' && d.options?.kind === kind)?.states?.value || '';
    const humidity = sensor('humidity');
    const co2 = sensor('co2');
    if (!humidity && !co2) continue;
    const thermo = devs.find((d) => (d.type === 'thermostat' || d.type === 'climate') && d.states?.current)?.states.current;
    out.push({ id: room.id, room: room.id, name: '', temperature: sensor('temperature') || thermo || '', humidity, co2, window: sensor('window') });
  }
  return out;
}
