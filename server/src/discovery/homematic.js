/**
 * Homematic / HomematicIP (adapter `hm-rpc`): thermostats, blinds, switches, dimmers and sensors.
 */
import { deviceOf, guessRoom, parentOf, parseHmName, slug } from './names.js';

/** Adds the devices; their rooms come from the names ("EG - Küche - Rollade"). */
export function discoverHomematic({ all, byId, rooms, add, matching }) {
  /** Room of a Homematic device: from its name, otherwise guessed (or `fallback`). */
  const hmRoom = (hm, fallback) => rooms.key(hm.room || fallback || guessRoom(hm.device), hm.floor);
  /** Humidity sensor for a channel `base` that has a HUMIDITY datapoint. */
  const addHumidity = (base, roomKey) => {
    if (byId.has(`${base}.HUMIDITY`)) {
      add({ id: `hm_${slug(base)}_hum`, type: 'sensor', name: 'Luftfeuchte', states: { value: `${base}.HUMIDITY` }, options: { kind: 'humidity' } }, roomKey);
    }
  };

  // Radiator thermostats: SET_POINT_TEMPERATURE + ACTUAL_TEMPERATURE (+ humidity)
  for (const o of matching(/^hm-rpc\.\d+\.[^.]+\.\d+\.SET_POINT_TEMPERATURE$/)) {
    const base = parentOf(o.id);
    const rk = hmRoom(parseHmName(o.name));
    const states = { target: o.id };
    if (byId.has(`${base}.ACTUAL_TEMPERATURE`)) states.current = `${base}.ACTUAL_TEMPERATURE`;
    add(
      {
        id: `hm_${slug(base)}`,
        type: 'thermostat',
        name: 'Heizung',
        states,
        options: { min: o.min ?? 5, max: o.max ?? 30, step: 0.5 },
      },
      rk,
    );
    addHumidity(base, rk);
  }

  // Blinds: HmIP shutter actuators are controlled via channel 4, channel 3 is the read-only transmitter
  for (const o of matching(/^hm-rpc\.\d+\.[^.]+\.4\.LEVEL$/, (x) => x.write)) {
    const sibling = byId.get(o.id.replace(/\.4\.LEVEL$/, '.3.LEVEL'));
    if (!sibling || sibling.role !== 'level.blind') continue;
    const hm = parseHmName(o.name);
    add({ id: `hm_${slug(parentOf(o.id))}`, type: 'blind', name: hm.device || 'Rollladen', states: { position: o.id }, options: {} }, hmRoom(hm));
  }

  // Switchable lights: role "switch" STATE datapoints (heating actuator relays are not lights)
  const isSwitch = (x) => /\.\d+\.STATE$/.test(x.id) && x.role === 'switch';
  for (const o of matching(/^hm-rpc\.\d+\.[^.]+\.\d+\.STATE$/, (x) => x.role === 'switch' && x.write)) {
    const hm = parseHmName(o.name);
    if (/heizaktor|heizung/i.test(hm.device)) continue;
    const channel = o.id.split('.').slice(-2, -1)[0];
    // actuators with several switch channels get the channel number appended to the name
    const sameDevice = all.filter((x) => x.id.startsWith(`${deviceOf(o.id)}.`) && isSwitch(x)).length;
    add(
      {
        id: `hm_${slug(parentOf(o.id))}`,
        type: 'light',
        name: sameDevice > 1 ? `${hm.device} ${channel}` : hm.device,
        states: { power: o.id },
        options: {},
        icon: 'ceiling',
      },
      hmRoom(hm),
    );
  }

  // Dimmer actuators (e.g. standing lamp): the level doubles as on/off
  for (const o of matching(/^hm-rpc\.\d+\.[^.]+\.1\.LEVEL$/, (x) => x.role === 'level.dimmer' && x.write)) {
    const hm = parseHmName(o.name);
    add(
      {
        id: `hm_${slug(parentOf(o.id))}`,
        type: 'light',
        name: hm.device,
        states: { brightness: o.id },
        options: { brightnessMax: o.max ?? 1 },
        icon: /stehlampe/i.test(hm.device) ? 'lamp' : 'light',
      },
      hmRoom(hm),
    );
  }

  // Brightness sensors (usually outdoors) and stand-alone temperature sensors
  for (const o of matching(/^hm-rpc\.\d+\.[^.]+\.1\.AVERAGE_ILLUMINATION$/)) {
    add({ id: `hm_${slug(parentOf(o.id))}_lux`, type: 'sensor', name: 'Helligkeit', states: { value: o.id }, options: { kind: 'lux' } }, hmRoom(parseHmName(o.name), 'Außen'));
  }
  for (const o of matching(/^hm-rpc\.\d+\.[^.]+\.1\.TEMPERATURE$/, (x) => x.role === 'value.temperature')) {
    const base = parentOf(o.id);
    const rk = rooms.key('Sonstiges', null);
    add({ id: `hm_${slug(base)}_temp`, type: 'sensor', name: 'Temperatur', states: { value: o.id }, options: { kind: 'temperature' } }, rk);
    addHumidity(base, rk);
  }
}
