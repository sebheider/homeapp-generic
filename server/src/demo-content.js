/**
 * Sample installation for the demo mode: rooms, devices, energy system, scenes and cameras,
 * plus believable start values. The datapoint ids look like `demo.0.<device>.<key>`.
 *
 * A device always has the same shape as in the real configuration:
 *   { id, type, name, room, icon?, states: { <key>: <ioBroker state id> }, options: {...} }
 */
const P = 'demo.0';

/** Values of the simulated local weather station (key = weather datapoint key). */
const DEMO_WEATHER = { temperature: 9.4, feelsLike: 7.6, dewPoint: 5.1, humidity: 71, pressure: 1016.4, windSpeed: 12, windGust: 24, windDir: 225, rainToday: 0.4, rainLastHour: 0, lux: 18400 };

/**
 * Builds a demo device whose datapoints are named `demo.0.<id>.<key>`.
 * @param {string} id device id
 * @param {string} type device type (light, thermostat, blind, ...)
 * @param {string} name display name
 * @param {string} room room id
 * @param {string[]} keys datapoint keys of the device type (power, brightness, ...)
 * @param {object} [options] type specific options (ranges, modes, ...)
 * @param {object} [extra] further fields such as `icon`
 */
const dev = (id, type, name, room, keys, options = {}, extra = {}) => ({
  id,
  type,
  name,
  room,
  states: Object.fromEntries(keys.map((k) => [k, `${P}.${id}.${k}`])),
  options,
  ...extra,
});

/** The complete demo installation (fresh objects on every call, so callers may modify them). */
export function demoContent() {
  const rooms = [
    { id: 'wohnzimmer', name: 'Wohnzimmer', icon: 'sofa', floor: 0 },
    { id: 'kueche', name: 'Küche', icon: 'cooking', floor: 0 },
    { id: 'schlafzimmer', name: 'Schlafzimmer', icon: 'bed', floor: 1 },
    { id: 'buero', name: 'Büro', icon: 'desk', floor: 1 },
    { id: 'bad', name: 'Bad', icon: 'bath', floor: 1 },
    { id: 'aussen', name: 'Außen', icon: 'trees', floor: 0 },
    { id: 'technik', name: 'Technik', icon: 'cpu', floor: -1 },
  ];

  const climateModes = [
    { value: 'cool', label: 'Kühlen', icon: 'snowflake' },
    { value: 'heat', label: 'Heizen', icon: 'flame' },
    { value: 'auto', label: 'Auto', icon: 'sparkles' },
    { value: 'dry', label: 'Entfeuchten', icon: 'droplets' },
    { value: 'fan', label: 'Lüften', icon: 'fan' },
  ];

  const devices = [
    dev('wz_decke', 'light', 'Deckenlicht', 'wohnzimmer', ['power', 'brightness'], { brightnessMax: 100 }),
    dev('wz_stehlampe', 'light', 'Stehlampe', 'wohnzimmer', ['power', 'brightness', 'color'], { brightnessMax: 100 }),
    dev('ku_spots', 'light', 'Küchenspots', 'kueche', ['power', 'brightness'], { brightnessMax: 100 }),
    dev('sz_nacht', 'light', 'Nachttisch', 'schlafzimmer', ['power', 'brightness'], { brightnessMax: 100 }),
    dev('bu_tisch', 'light', 'Schreibtischlampe', 'buero', ['power', 'brightness'], { brightnessMax: 100 }),
    dev('bad_spiegel', 'light', 'Spiegellicht', 'bad', ['power'], {}),
    dev('gar_weg', 'light', 'Gartenbeleuchtung', 'aussen', ['power'], {}, { icon: 'trees' }),
    dev('gar_fassade', 'light', 'Fassadenlicht', 'aussen', ['power', 'brightness'], { brightnessMax: 100 }),

    dev('wz_heizung', 'thermostat', 'Heizung', 'wohnzimmer', ['current', 'target', 'valve'], { min: 5, max: 30, step: 0.5 }),
    dev('sz_heizung', 'thermostat', 'Heizung', 'schlafzimmer', ['current', 'target', 'valve'], { min: 5, max: 30, step: 0.5 }),
    dev('bu_heizung', 'thermostat', 'Heizung', 'buero', ['current', 'target', 'valve'], { min: 5, max: 30, step: 0.5 }),
    dev('bad_heizung', 'thermostat', 'Heizung', 'bad', ['current', 'target', 'valve'], { min: 5, max: 30, step: 0.5 }),

    dev('wz_rollo', 'blind', 'Rollladen Terrasse', 'wohnzimmer', ['position'], {}),
    dev('ku_rollo', 'blind', 'Rollladen Küche', 'kueche', ['position'], {}),
    dev('sz_rollo', 'blind', 'Rollladen', 'schlafzimmer', ['position'], {}),

    dev('ku_kaffee', 'switch', 'Kaffeemaschine', 'kueche', ['power', 'consumption'], {}, { icon: 'coffee' }),
    dev('te_waschm', 'switch', 'Waschmaschine', 'technik', ['power', 'consumption'], {}, { icon: 'washing' }),

    dev('wz_klima', 'climate', 'Klimaanlage', 'wohnzimmer', ['power', 'mode', 'target', 'current', 'fan'], {
      min: 16, max: 30, step: 1,
      modes: climateModes,
      fanModes: [
        { value: 'auto', label: 'Auto' },
        { value: 'low', label: 'Leise' },
        { value: 'mid', label: 'Mittel' },
        { value: 'high', label: 'Stark' },
      ],
    }),
    dev('te_wp', 'heatpump', 'Wärmepumpe', 'technik', [
      'power', 'compressor', 'flowTemp', 'returnTemp', 'outsideTemp', 'dhwTemp', 'dhwTarget', 'electricPower', 'heatPower', 'cop',
    ], { dhwMin: 35, dhwMax: 65 }),

    dev('aussen_temp', 'sensor', 'Außentemperatur', 'aussen', ['value'], { kind: 'temperature' }),
    dev('aussen_wind', 'sensor', 'Wind', 'aussen', ['value'], { kind: 'wind' }),
    dev('wz_hum', 'sensor', 'Luftfeuchte', 'wohnzimmer', ['value'], { kind: 'humidity' }),
    dev('wz_temp', 'sensor', 'Raumtemperatur', 'wohnzimmer', ['value'], { kind: 'temperature' }),
    dev('bu_co2', 'sensor', 'CO₂', 'buero', ['value'], { kind: 'co2' }),
    dev('flur_motion', 'sensor', 'Bewegung Flur', 'wohnzimmer', ['value'], { kind: 'motion' }),
    dev('haustuer', 'sensor', 'Haustür', 'aussen', ['value'], { kind: 'door' }),
    dev('ku_fenster', 'sensor', 'Fenster', 'kueche', ['value'], { kind: 'window' }),

    // robotic mower with the datapoints of the navimow adapter (simulated by demo-mower.js)
    dev('gar_maeher', 'mower', 'Mähroboter', 'aussen', [
      'state', 'battery', 'progress', 'area', 'weekArea', 'x', 'y', 'heading', 'positionTime', 'track', 'frame', 'station',
      'updated', 'online', 'model', 'firmware', 'start', 'pause', 'resume', 'home', 'refresh', 'resetMap',
    ], {}),
  ];

  const energy = {
    enabled: true,
    gridInvert: false,
    batteryInvert: false,
    states: {
      production: `${P}.energy.production`,
      consumption: `${P}.energy.consumption`,
      grid: `${P}.energy.grid`,
      battery: `${P}.energy.battery`,
      batterySoc: `${P}.energy.batterySoc`,
      dailyYield: `${P}.energy.dailyYield`,
      totalYield: `${P}.energy.totalYield`,
    },
  };

  const lightIds = devices.filter((d) => d.type === 'light').map((d) => d.states.power);
  const s = (state, value) => ({ state, value });
  const scenes = [
    {
      id: 'morgen',
      name: 'Guten Morgen',
      icon: 'sunrise',
      actions: [
        s(`${P}.wz_rollo.position`, 100),
        s(`${P}.ku_rollo.position`, 100),
        s(`${P}.sz_rollo.position`, 100),
        s(`${P}.ku_spots.power`, true),
        s(`${P}.ku_kaffee.power`, true),
      ],
    },
    {
      id: 'film',
      name: 'Filmabend',
      icon: 'clapperboard',
      actions: [
        s(`${P}.wz_decke.power`, false),
        s(`${P}.wz_stehlampe.power`, true),
        s(`${P}.wz_stehlampe.brightness`, 20),
        s(`${P}.wz_stehlampe.color`, '#ff8a3d'),
        s(`${P}.wz_rollo.position`, 0),
      ],
    },
    {
      id: 'gehen',
      name: 'Alles aus',
      icon: 'power',
      actions: [...lightIds.map((id) => s(id, false)), s(`${P}.ku_kaffee.power`, false)],
    },
    {
      id: 'nacht',
      name: 'Gute Nacht',
      icon: 'moon',
      actions: [
        ...lightIds.map((id) => s(id, false)),
        s(`${P}.wz_rollo.position`, 0),
        s(`${P}.ku_rollo.position`, 0),
        s(`${P}.sz_rollo.position`, 0),
        s(`${P}.sz_heizung.target`, 18),
      ],
    },
  ];

  const cameras = [
    { id: '1', name: 'Eingang', room: 'aussen', popup: true, motionState: `${P}.cam.1.motion`, peopleState: `${P}.cam.1.people` },
    { id: '2', name: 'Garten', room: 'aussen', popup: true, motionState: `${P}.cam.2.motion`, peopleState: `${P}.cam.2.people` },
    { id: '3', name: 'Garage', room: 'aussen', popup: true, motionState: `${P}.cam.3.motion`, peopleState: `${P}.cam.3.people` },
    { id: '4', name: 'Terrasse', room: 'aussen', popup: true, motionState: `${P}.cam.4.motion`, peopleState: `${P}.cam.4.people` },
  ];

  // sample notifications (same shape as `alerts` in the configuration, see alerts.js)
  const alert = (id, name, state, op, value, severity, message, view, room = '', extra = {}) => ({
    id, name, enabled: true, state, op, value, hysteresis: 0, delaySeconds: 0, severity, message, view, room, requireAck: severity === 'alarm', ...extra,
  });
  const alerts = [
    alert('haustuer', 'Haustür geöffnet', `${P}.haustuer.value`, 'on', '', 'alarm', 'Die Haustür wurde geöffnet', 'rooms', 'aussen'),
    alert('co2_buero', 'CO₂ Büro', `${P}.bu_co2.value`, '>', 1000, 'warning', 'CO₂ im Büro bei {value} ppm – bitte lüften', 'rooms', 'buero', { hysteresis: 100 }),
    alert('feuchte_wz', 'Luftfeuchte Wohnzimmer', `${P}.wz_hum.value`, '>', 60, 'warning', 'Luftfeuchte im Wohnzimmer bei {value} %', 'climate', '', { hysteresis: 3 }),
    alert('frost', 'Frostgefahr', `${P}.aussen_temp.value`, '<', 3, 'alarm', 'Frostgefahr: {value} °C außen', 'weather'),
    alert('waschmaschine', 'Waschmaschine', `${P}.te_waschm.power`, 'on', '', 'info', 'Die Waschmaschine läuft', 'rooms', 'technik'),
  ];

  return { rooms, devices, energy, scenes, cameras, alerts, weatherStates: Object.fromEntries(Object.keys(DEMO_WEATHER).map((k) => [k, `${P}.weather.${k}`])) };
}

/** Start values of all demo datapoints (state id -> value). */
export function demoInitialStates() {
  const { devices } = demoContent();
  const v = {};
  const set = (id, key, val) => {
    const d = devices.find((x) => x.id === id);
    if (d?.states[key]) v[d.states[key]] = val;
  };
  for (const d of devices) {
    if (d.type === 'light') {
      set(d.id, 'power', false);
      set(d.id, 'brightness', 80);
      set(d.id, 'color', '#ffd9a0');
    }
  }
  set('wz_decke', 'power', true);
  set('wz_decke', 'brightness', 65);
  set('ku_spots', 'power', true);
  set('gar_weg', 'power', true);
  set('wz_stehlampe', 'color', '#ffb866');

  const thermo = { wz_heizung: [21.4, 22], sz_heizung: [18.6, 18], bu_heizung: [20.8, 21], bad_heizung: [22.1, 23] };
  for (const [id, [cur, tgt]] of Object.entries(thermo)) {
    set(id, 'current', cur);
    set(id, 'target', tgt);
    set(id, 'valve', 20);
  }
  set('wz_rollo', 'position', 100);
  set('ku_rollo', 'position', 100);
  set('sz_rollo', 'position', 30);
  set('ku_kaffee', 'power', false);
  set('ku_kaffee', 'consumption', 0);
  set('te_waschm', 'power', true);
  set('te_waschm', 'consumption', 412);

  set('wz_klima', 'power', false);
  set('wz_klima', 'mode', 'cool');
  set('wz_klima', 'target', 23);
  set('wz_klima', 'current', 24.1);
  set('wz_klima', 'fan', 'auto');

  set('te_wp', 'power', true);
  set('te_wp', 'compressor', true);
  set('te_wp', 'flowTemp', 34.5);
  set('te_wp', 'returnTemp', 29.8);
  set('te_wp', 'outsideTemp', 9.4);
  set('te_wp', 'dhwTemp', 49.2);
  set('te_wp', 'dhwTarget', 50);
  set('te_wp', 'electricPower', 780);
  set('te_wp', 'heatPower', 3100);
  set('te_wp', 'cop', 4);

  set('aussen_temp', 'value', 9.4);
  set('aussen_wind', 'value', 12);
  set('wz_hum', 'value', 46);
  set('wz_temp', 'value', 21.4);
  set('bu_co2', 'value', 720);
  set('flur_motion', 'value', false);
  set('haustuer', 'value', false);
  set('ku_fenster', 'value', false);

  v[`${P}.energy.production`] = 0;
  v[`${P}.energy.consumption`] = 800;
  v[`${P}.energy.grid`] = 800;
  v[`${P}.energy.battery`] = 0;
  v[`${P}.energy.batterySoc`] = 62;
  v[`${P}.energy.dailyYield`] = 0;
  v[`${P}.energy.totalYield`] = 8421;
  for (const [k, x] of Object.entries(DEMO_WEATHER)) v[`${P}.weather.${k}`] = x;
  for (const c of demoContent().cameras) {
    v[c.motionState] = false;
    v[c.peopleState] = false;
  }
  return v;
}
