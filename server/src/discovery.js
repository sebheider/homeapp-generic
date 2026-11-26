/**
 * Automatic device discovery.
 *
 * Scans the object list of an ioBroker installation and proposes ready-to-use
 * devices (lights, thermostats, blinds, sensors, climate units, heat pump, robotic mowers,
 * energy system) together with rooms and scenes.
 *
 * Supported adapters:
 *   - hue            (lights, smart plugs, scene buttons of room groups)
 *   - hm-rpc         (Homematic / HomematicIP: thermostats, blinds, switches, dimmers, sensors)
 *   - e3dc-rscp      (E3/DC home power station: PV, battery, grid, house, wallbox)
 *   - daikin-cloud   (Daikin air conditioners and Altherma heat pumps)
 *   - mqtt "WeatherMan" weather station (outdoor temperature, wind, rain, UV, ...): sensors plus the
 *     datapoint mapping for the weather block of the dashboard
 *   - navimow       (Segway Navimow robotic mowers: state, battery, progress, position, map track, commands)
 *
 * The result is only a *proposal*: the settings page lets the user review and
 * merge it into the configuration. Nothing in here writes to ioBroker.
 *
 * Every adapter has its own module in discovery/ (hue, homematic, e3dc, daikin, weatherman, navimow);
 * discovery/names.js holds the shared naming and room helpers.
 */
import { escapeRegExp } from './util/text.js';
import { discoverDaikin } from './discovery/daikin.js';
import { discoverE3dc } from './discovery/e3dc.js';
import { discoverHomematic } from './discovery/homematic.js';
import { discoverHue } from './discovery/hue.js';
import { RoomBook } from './discovery/names.js';
import { discoverNavimow } from './discovery/navimow.js';
import { discoverWeatherStation, weatherStationStates } from './discovery/weatherman.js';

/**
 * Runs the discovery.
 * @param {Map<string, object>} objects  ioBroker state objects (id -> common info)
 * @param {(id: string) => Promise<unknown>} read  reads the current value of a state (used for names)
 */
export async function discover(objects, read) {
  const all = [...objects.values()];
  const byId = objects;
  const rooms = new RoomBook();
  const devices = [];
  const scenes = [];

  /** Adds a device whose room is resolved at the very end. */
  const add = (device, roomKey) => devices.push({ ...device, _room: roomKey });
  /** All objects whose id matches `re` and that satisfy `pred`. */
  const matching = (re, pred = () => true) => all.filter((o) => re.test(o.id) && pred(o));
  const ctx = { all, byId, rooms, add, matching, read, scenes };

  // fixed order: devices with equal room, type and name (the final sort is stable) and scenes keep it
  discoverHue(ctx);
  discoverHomematic(ctx);
  const energy = discoverE3dc(ctx);
  await discoverDaikin(ctx);
  discoverWeatherStation(ctx);
  await discoverNavimow(ctx);
  const weatherStates = weatherStationStates(ctx);

  /* ----------------------------------------------------------- finish ---- */
  const roomMap = new Map();
  for (const d of devices) {
    const r = rooms.resolve(d._room);
    roomMap.set(r.id, r);
    d.room = r.id;
    delete d._room;
    // "Wohnzimmer Schrank" inside the room "Wohnzimmer" is shown as "Schrank"
    const stripped = d.name.replace(new RegExp(`^${escapeRegExp(r.name)}\\s+`, 'i'), '');
    if (stripped && stripped !== d.name && stripped.length > 2) d.name = stripped[0].toUpperCase() + stripped.slice(1);
  }
  // Light scenes: "all lights off" built from every discovered light/plug
  const lightPowers = devices.filter((d) => (d.type === 'light' || d.type === 'switch') && !/kaffee/i.test(d.name));
  if (lightPowers.length) {
    scenes.unshift({
      id: 'alle_lichter_aus',
      name: 'Alle Lichter aus',
      icon: 'power',
      actions: lightPowers.map((d) => ({ state: d.states.power || d.states.brightness, value: d.states.power ? false : 0 })),
    });
  }

  // stable ordering: rooms alphabetically, devices by type then name
  const typeOrder = { light: 0, switch: 1, thermostat: 2, climate: 3, heatpump: 4, blind: 5, sensor: 6, mower: 7 };
  devices.sort((a, b) => a.room.localeCompare(b.room) || typeOrder[a.type] - typeOrder[b.type] || a.name.localeCompare(b.name, 'de'));
  const roomList = [...roomMap.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));

  return { rooms: roomList, devices, energy, scenes, weather: Object.keys(weatherStates).length ? { states: weatherStates } : null };
}
