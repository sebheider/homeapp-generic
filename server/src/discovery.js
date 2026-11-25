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
 */
import { escapeRegExp } from './util.js';

/** "Küche Süd" -> "kueche_sued" (ids for rooms and devices). */
const slug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

/** Icon suggestion for a room, derived from its name. */
const ROOM_ICONS = [
  [/wohn/i, 'sofa'],
  [/küche|kueche/i, 'cooking'],
  [/ess/i, 'utensils'],
  [/schlaf/i, 'bed'],
  [/büro|buero/i, 'desk'],
  [/bad/i, 'bath'],
  [/gäste|gaeste|wc/i, 'shower'],
  [/garten|außen|aussen|terrasse|terasse|mauer|beet/i, 'trees'],
  [/keller|garage/i, 'garage'],
  [/technik|heiz/i, 'cpu'],
  [/wetter/i, 'sun'],
  [/flur|diele|treppe/i, 'home'],
];
const roomIcon = (name) => ROOM_ICONS.find(([re]) => re.test(name))?.[1] || 'home';

/** Room guess for names that do not carry an explicit room (e.g. Hue lamp names). */
const ROOM_KEYWORDS = [
  [/esstisch|esszimmer/i, 'Esszimmer'],
  [/wohnzimmer|kugel|tv|stehlampe/i, 'Wohnzimmer'],
  [/küche|kueche|schrank|milch|kaffee/i, 'Küche'],
  [/keller/i, 'Keller'],
  [/garten|mauer|terasse|terrasse|blumenbeet|trockenmauer|außen|aussen/i, 'Außen'],
  [/schlaf/i, 'Schlafzimmer'],
  [/büro|buero/i, 'Büro'],
  [/bad/i, 'Badezimmer'],
];
const guessRoom = (text) => ROOM_KEYWORDS.find(([re]) => re.test(text))?.[1] || 'Sonstiges';

/** Icon suggestion for a Hue scene, derived from its label. */
const SCENE_ICONS = [
  [/nacht/i, 'moon'],
  [/film|honolulu/i, 'clapperboard'],
  [/lesen|konzentr/i, 'desk'],
];
const sceneIcon = (label) => SCENE_ICONS.find(([re]) => re.test(label))?.[1] || 'light';

/** Daikin operation modes: label and icon per mode key. */
const AC_MODE_ICONS = { fanOnly: ['Lüften', 'fan'], heating: ['Heizen', 'flame'], cooling: ['Kühlen', 'snowflake'], auto: ['Auto', 'sparkles'], dry: ['Entfeuchten', 'droplets'] };
const FAN_LABELS = { auto: 'Auto', quiet: 'Leise', fixed: 'Fest' };

/**
 * Datapoints of a mower of the navimow adapter, relative to `navimow.<instance>.<serial>` (first existing
 * candidate wins). The map datapoints (mapTrack, mapFrame, dockPosition) only exist with the adapter's map switched on.
 */
const NAVIMOW_STATES = {
  battery: ['status.battery'],
  progress: ['location.mowingPercentage'],
  area: ['location.subtotalArea'],
  weekArea: ['location.mowingWeekArea'],
  x: ['location.postureX'],
  y: ['location.postureY'],
  heading: ['location.postureTheta'],
  positionTime: ['location.time'],
  track: ['mapTrack'],
  frame: ['mapFrame'],
  station: ['dockPosition'],
  updated: ['status.timestamp'],
  model: ['general.model'],
  firmware: ['general.firmware'],
  start: ['remote.start'],
  pause: ['remote.pause'],
  resume: ['remote.resume'],
  home: ['remote.dock'],
  refresh: ['remote.Refresh', 'remote.refresh'],
  resetMap: ['remote.resetMap'],
};

/**
 * Mode buttons for a Daikin unit from the `states` list of its operationMode object.
 * @param {object|undefined} modeObj ioBroker object of the operationMode datapoint
 * @param {Record<string, string>} [targets] mode key -> setpoint key of the device (air conditioner only)
 */
function modeOptions(modeObj, targets = {}) {
  return Object.entries(modeObj?.states || {}).map(([value, key]) => {
    const [label, icon] = AC_MODE_ICONS[key] || [key, 'sparkles'];
    const target = Object.hasOwn(targets, key) ? targets[key] : undefined;
    return { value, label, icon, ...(target ? { target } : {}) };
  });
}

/** Parent of an ioBroker id (everything before the last dot). */
const parentOf = (id) => id.slice(0, id.lastIndexOf('.'));

/** The first three segments of an id: adapter, instance and device ("hm-rpc.0.ABC123"). */
const deviceOf = (id) => id.split('.').slice(0, 3).join('.');

/** "EG - Küche - Rollade:4.LEVEL" -> { floor: 'EG', room: 'Küche', device: 'Rollade' } */
function parseHmName(name) {
  const clean = String(name || '').replace(/:\d+\..*$/, '');
  const m = clean.match(/^(EG|OG|KG|DG)\s*-\s*(.+?)\s*-\s*(.+)$/);
  if (m) return { floor: m[1], room: m[2].trim(), device: m[3].trim() };
  return { floor: null, room: null, device: clean.trim() };
}

/**
 * Collects rooms while devices are being added. A room name that exists on
 * several floors (e.g. "Flur" on EG and KG) is shown with its floor appended.
 */
class RoomBook {
  constructor() {
    this.floorsByRoom = new Map();
  }

  /** Registers a room and returns a lazy key that is resolved in {@link resolve}. */
  key(room, floor) {
    room = room || 'Sonstiges';
    const set = this.floorsByRoom.get(room) || new Set();
    if (floor) set.add(floor);
    this.floorsByRoom.set(room, set);
    return { room, floor };
  }

  /** Final room ({ id, name, icon }) of a key, once all rooms are known. */
  resolve(k) {
    const floors = this.floorsByRoom.get(k.room);
    const name = floors && floors.size > 1 && k.floor ? `${k.room} ${k.floor}` : k.room;
    return { id: slug(name), name, icon: roomIcon(k.room) };
  }
}

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
  let energy = null;

  /** Adds a device whose room is resolved at the very end. */
  const add = (device, roomKey) => devices.push({ ...device, _room: roomKey });
  /** All objects whose id matches `re` and that satisfy `pred`. */
  const matching = (re, pred = () => true) => all.filter((o) => re.test(o.id) && pred(o));
  /** Room of a Homematic device: from its name, otherwise guessed (or `fallback`). */
  const hmRoom = (hm, fallback) => rooms.key(hm.room || fallback || guessRoom(hm.device), hm.floor);
  /** Humidity sensor for a channel `base` that has a HUMIDITY datapoint. */
  const addHumidity = (base, roomKey) => {
    if (byId.has(`${base}.HUMIDITY`)) {
      add({ id: `hm_${slug(base)}_hum`, type: 'sensor', name: 'Luftfeuchte', states: { value: `${base}.HUMIDITY` }, options: { kind: 'humidity' } }, roomKey);
    }
  };

  /* ------------------------------------------------------------ Hue ----- */
  // lights and plugs: an "on" switch with a "reachable" sibling; without a level/bri datapoint it is a plug
  const hueOn = matching(/^hue\.\d+\..+\.on$/, (o) => o.role === 'switch.light' && byId.has(`${parentOf(o.id)}.reachable`));
  for (const o of hueOn) {
    const base = parentOf(o.id);
    // the object name is "<lamp name>.on"
    const name = (o.name.split('.').slice(-2, -1)[0] || base.split('.').pop()).trim();
    if (/entertainment/i.test(name)) continue;
    const dimmer = byId.get(`${base}.level`) || byId.get(`${base}.bri`);
    const room = guessRoom(name);
    const isPlug = !dimmer;
    const states = { power: o.id };
    if (dimmer) states.brightness = dimmer.id;
    add(
      {
        id: `hue_${slug(base.split('.').slice(2).join('_'))}`,
        type: isPlug ? 'switch' : 'light',
        name,
        states,
        options: dimmer ? { brightnessMax: dimmer.id.endsWith('.bri') ? 254 : 100 } : {},
        ...(isPlug && /kaffee/i.test(name) ? { icon: 'coffee' } : {}),
      },
      rooms.key(room, null),
    );
  }

  // Hue room groups expose their saved scenes as buttons (scene_*)
  for (const group of ['Wohnzimmer', 'Esszimmer']) {
    const buttons = matching(new RegExp(`^hue\\.\\d+\\.[^.]+\\.${group}\\.scene_`), (o) => o.role === 'button');
    for (const b of buttons) {
      const label = b.name.replace(/^Scene\s+/i, '');
      scenes.push({
        id: `hue_${slug(group)}_${slug(label)}`,
        name: `${group}: ${label}`,
        icon: sceneIcon(label),
        actions: [{ state: b.id, value: true }],
      });
    }
  }

  /* ------------------------------------------------- Homematic (hm-rpc) -- */
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

  /* ------------------------------------------------------- E3/DC energy -- */
  const e3 = (name) => (byId.has(`e3dc-rscp.0.EMS.${name}`) ? `e3dc-rscp.0.EMS.${name}` : undefined);
  if (e3('POWER_PV')) {
    energy = {
      enabled: true,
      // E3/DC reports "Power to battery" (positive = charging) while the app uses positive = discharging
      batteryInvert: true,
      // E3/DC reports "Power from grid" (positive = import), same as the app
      gridInvert: false,
      states: Object.fromEntries(
        Object.entries({
          production: e3('POWER_PV'),
          consumption: e3('POWER_HOME'),
          grid: e3('POWER_GRID'),
          battery: e3('POWER_BAT'),
          batterySoc: e3('BAT_SOC'),
          wallbox: e3('POWER_WB_ALL'),
          autarky: e3('AUTARKY'),
          selfConsumption: e3('SELF_CONSUMPTION'),
        }).filter(([, v]) => v),
      ),
    };
  }

  /* ------------------------------------------------------- Daikin cloud -- */
  // every unit lives under daikin-cloud.<instance>.<uuid>
  const daikinUnits = new Set(matching(/^daikin-cloud\.\d+\.[0-9a-f-]{36}\./).map((o) => deviceOf(o.id)));
  for (const unit of daikinUnits) {
    const has = (suffix) => byId.has(`${unit}.${suffix}`);
    if (has('climateControl.onOffMode')) {
      // Room air conditioner: one setpoint per operating mode
      const name = String((await read(`${unit}.climateControl.name`)) || 'Klimaanlage');
      const modes = modeOptions(byId.get(`${unit}.climateControl.operationMode`), { heating: 'targetHeat', cooling: 'targetCool', auto: 'targetAuto' });
      const fanObj = byId.get(`${unit}.climateControl.fanControl.operationModes.cooling.fanSpeed.currentMode`);
      const fanModes = Object.entries(fanObj?.states || {}).map(([value, key]) => ({ value, label: FAN_LABELS[key] || key }));
      const states = {
        power: `${unit}.climateControl.onOffMode`,
        mode: `${unit}.climateControl.operationMode`,
        current: `${unit}.climateControl.sensoryData.roomTemperature`,
      };
      for (const [key, m] of [['targetHeat', 'heating'], ['targetCool', 'cooling'], ['targetAuto', 'auto']]) {
        if (has(`climateControl.temperatureControl.operationModes.${m}.setpoints.roomTemperature`)) {
          states[key] = `${unit}.climateControl.temperatureControl.operationModes.${m}.setpoints.roomTemperature`;
        }
      }
      if (fanObj) states.fan = fanObj.id;
      add(
        { id: `daikin_${slug(unit.split('.').pop())}`, type: 'climate', name: `Klima ${name}`, states, options: { min: 16, max: 30, step: 1, modes, fanModes } },
        rooms.key(name, null),
      );
    }
    if (has('climateControlMainZone.onOffMode') && has('domesticHotWaterTank.onOffMode')) {
      // Altherma heat pump: heating circuit + hot water tank
      const modes = modeOptions(byId.get(`${unit}.climateControlMainZone.operationMode`));
      const dhw = byId.get(`${unit}.domesticHotWaterTank.temperatureControl.operationModes.heating.setpoints.domesticHotWaterTemperature`);
      add(
        {
          id: `daikin_${slug(unit.split('.').pop())}`,
          type: 'heatpump',
          name: 'Wärmepumpe',
          states: {
            power: `${unit}.climateControlMainZone.onOffMode`,
            mode: `${unit}.climateControlMainZone.operationMode`,
            flowTemp: `${unit}.climateControlMainZone.sensoryData.leavingWaterTemperature`,
            outsideTemp: `${unit}.climateControlMainZone.sensoryData.outdoorTemperature`,
            dhwTemp: `${unit}.domesticHotWaterTank.sensoryData.tankTemperature`,
            ...(dhw ? { dhwTarget: dhw.id } : {}),
          },
          options: { dhwMin: dhw?.min ?? 30, dhwMax: dhw?.max ?? 65, modes },
        },
        rooms.key('Technik', null),
      );
    }
  }

  /* ---------------------------------------- MQTT weather station ("WeatherMan") */
  const wm = (name) => byId.get(`mqtt.0.WeatherMan.${name}`);
  const weather = [
    ['temperatur', 'Außentemperatur', 'temperature'],
    ['feuchte_rel', 'Luftfeuchte außen', 'humidity'],
    ['wind_mittel', 'Wind', 'wind'],
    ['regen_mm_heute', 'Regen heute', 'rain'],
    ['barometer', 'Luftdruck', 'pressure'],
    ['lux', 'Helligkeit außen', 'lux'],
  ];
  for (const [key, name, kind] of weather) {
    if (wm(key)) add({ id: `weather_${key}`, type: 'sensor', name, states: { value: wm(key).id }, options: { kind } }, rooms.key('Wetter', null));
  }

  /* ------------------------------------------- Navimow mowers (navimow) -- */
  // every mower lives under navimow.<instance>.<serial>; its state is the anchor
  for (const o of matching(/^navimow\.\d+\.[^.]+\.status\.vehicleState$/)) {
    const base = o.id.slice(0, -'.status.vehicleState'.length);
    const instance = base.split('.').slice(0, 2).join('.');
    const states = { state: o.id };
    for (const [key, candidates] of Object.entries(NAVIMOW_STATES)) {
      const suffix = candidates.find((c) => byId.has(`${base}.${c}`));
      if (suffix) states[key] = `${base}.${suffix}`;
    }
    if (byId.has(`${instance}.info.connection`)) states.online = `${instance}.info.connection`;
    const name = String((await read(`${base}.general.name`)) || 'Mähroboter');
    add({ id: `navimow_${slug(base.split('.').slice(1).join('_'))}`, type: 'mower', name, states, options: {} }, rooms.key('Garten', null));
  }
  // the same station feeds the weather block of the dashboard (datapoint key -> WeatherMan name)
  const weatherStates = {};
  for (const [key, name] of Object.entries({
    temperature: 'temperatur',
    feelsLike: 'windchill',
    dewPoint: 'taupunkt',
    humidity: 'feuchte_rel',
    pressure: 'barometer',
    windSpeed: 'wind_mittel',
    windGust: 'wind_spitze',
    rainToday: 'regen_mm_heute',
    rainLastHour: 'regen_letzte_h',
    lux: 'lux',
  })) {
    if (wm(name)) weatherStates[key] = wm(name).id;
  }

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
