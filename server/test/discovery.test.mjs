// Automatic device discovery against a small sample installation (see fixtures/discovery-objects.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discover } from '../src/discovery.js';
import { objects, read } from './fixtures/discovery-objects.mjs';

const result = await discover(objects, read);
const device = (id) => result.devices.find((d) => d.id === id);

test('hue: dimmable lamps, plugs and room scene buttons', () => {
  assert.deepEqual(device('hue_stehlampe'), {
    id: 'hue_stehlampe',
    type: 'light',
    name: 'Stehlampe',
    room: 'wohnzimmer',
    states: { power: 'hue.0.Stehlampe.on', brightness: 'hue.0.Stehlampe.level' },
    options: { brightnessMax: 100 },
  });
  assert.equal(device('hue_esstisch').options.brightnessMax, 254, '.bri datapoints range up to 254');
  assert.equal(device('hue_kaffee_steckdose').type, 'switch');
  assert.equal(device('hue_kaffee_steckdose').icon, 'coffee');
  assert.equal(result.devices.some((d) => /entertainment/i.test(d.name)), false, 'entertainment areas are skipped');
  const night = result.scenes.find((s) => s.id === 'hue_wohnzimmer_nachtlicht');
  assert.deepEqual(night, { id: 'hue_wohnzimmer_nachtlicht', name: 'Wohnzimmer: Nachtlicht', icon: 'moon', actions: [{ state: 'hue.0.Bridge.Wohnzimmer.scene_Nachtlicht', value: true }] });
  assert.equal(result.scenes.find((s) => s.id === 'hue_esszimmer_lesen').icon, 'desk');
});

test('homematic: thermostat, blinds, switches, dimmer and sensors', () => {
  const thermo = device('hm_hm_rpc_0_therm1_1');
  assert.equal(thermo.type, 'thermostat');
  assert.equal(thermo.room, 'kueche');
  assert.deepEqual(thermo.options, { min: 4.5, max: 30.5, step: 0.5 });
  assert.equal(thermo.states.current, 'hm-rpc.0.THERM1.1.ACTUAL_TEMPERATURE');
  assert.equal(device('hm_hm_rpc_0_therm1_1_hum').states.value, 'hm-rpc.0.THERM1.1.HUMIDITY');

  // a room that exists on two floors gets the floor appended
  assert.equal(device('hm_hm_rpc_0_blind1_4').room, 'flur_eg');
  assert.equal(device('hm_hm_rpc_0_blind2_4').room, 'flur_kg');
  assert.equal(device('hm_hm_rpc_0_other_4'), undefined, 'channel 4 without blind transmitter is no blind');

  // two channels of one actuator are numbered; the room prefix is stripped from the name
  assert.equal(device('hm_hm_rpc_0_sw1_3').name, 'Schrank 3');
  assert.equal(device('hm_hm_rpc_0_sw1_4').name, 'Schrank 4');
  assert.equal(result.devices.some((d) => d.id.includes('heat1')), false, 'heating actuators are no lights');

  const dimmer = device('hm_hm_rpc_0_dim1_1');
  assert.deepEqual([dimmer.type, dimmer.icon, dimmer.room, dimmer.options.brightnessMax], ['light', 'lamp', 'schlafzimmer', 1.01]);

  assert.equal(device('hm_hm_rpc_0_lux1_1_lux').room, 'aussen');
  assert.equal(device('hm_hm_rpc_0_temp1_1_temp').room, 'sonstiges');
  assert.ok(device('hm_hm_rpc_0_temp1_1_hum'));
});

test('e3dc: energy block with only the datapoints that exist', () => {
  assert.deepEqual(result.energy, {
    enabled: true,
    batteryInvert: true,
    gridInvert: false,
    states: { production: 'e3dc-rscp.0.EMS.POWER_PV', consumption: 'e3dc-rscp.0.EMS.POWER_HOME', grid: 'e3dc-rscp.0.EMS.POWER_GRID', batterySoc: 'e3dc-rscp.0.EMS.BAT_SOC' },
  });
});

test('daikin: air conditioner modes / fan speeds and heat pump', () => {
  const ac = device('daikin_12345678_1234_1234_1234_123456789abc');
  assert.equal(ac.name, 'Klima Büro');
  assert.equal(ac.room, 'buero');
  assert.deepEqual(ac.options.modes, [
    { value: 'heating', label: 'Heizen', icon: 'flame', target: 'targetHeat' },
    { value: 'cooling', label: 'Kühlen', icon: 'snowflake', target: 'targetCool' },
    { value: 'fanOnly', label: 'Lüften', icon: 'fan' },
    { value: 'special', label: 'special', icon: 'sparkles' },
  ]);
  assert.deepEqual(ac.options.fanModes, [
    { value: 'auto', label: 'Auto' },
    { value: 'quiet', label: 'Leise' },
    { value: 'turbo', label: 'turbo' },
  ]);
  assert.ok(ac.states.targetHeat && ac.states.targetCool && !ac.states.targetAuto);

  const hp = device('daikin_abcdefab_cdef_abcd_efab_cdefabcdefab');
  assert.equal(hp.type, 'heatpump');
  assert.equal(hp.room, 'technik');
  assert.deepEqual(hp.options, {
    dhwMin: 30,
    dhwMax: 60,
    modes: [
      { value: 'heating', label: 'Heizen', icon: 'flame' },
      { value: 'auto', label: 'Auto', icon: 'sparkles' },
    ],
  });
});

test('weather station: sensors and dashboard datapoint mapping', () => {
  assert.ok(device('weather_temperatur'));
  assert.ok(device('weather_lux'));
  assert.deepEqual(result.weather, {
    states: { temperature: 'mqtt.0.WeatherMan.temperatur', windGust: 'mqtt.0.WeatherMan.wind_spitze', lux: 'mqtt.0.WeatherMan.lux' },
  });
});

test('navimow: mower with state, map, commands and the cloud connection', () => {
  const m = device('navimow_0_s4rea2532k1983');
  const base = 'navimow.0.S4REA2532K1983';
  assert.equal(m.type, 'mower');
  assert.equal(m.name, 'Navimow i105');
  assert.equal(m.room, 'garten');
  assert.deepEqual(m.states, {
    state: `${base}.status.vehicleState`,
    battery: `${base}.status.battery`,
    progress: `${base}.location.mowingPercentage`,
    area: `${base}.location.subtotalArea`,
    weekArea: `${base}.location.mowingWeekArea`,
    x: `${base}.location.postureX`,
    y: `${base}.location.postureY`,
    heading: `${base}.location.postureTheta`,
    positionTime: `${base}.location.time`,
    track: `${base}.mapTrack`,
    frame: `${base}.mapFrame`,
    station: `${base}.dockPosition`,
    updated: `${base}.status.timestamp`,
    model: `${base}.general.model`,
    firmware: `${base}.general.firmware`,
    start: `${base}.remote.start`,
    pause: `${base}.remote.pause`,
    resume: `${base}.remote.resume`,
    home: `${base}.remote.dock`,
    refresh: `${base}.remote.Refresh`,
    resetMap: `${base}.remote.resetMap`,
    online: 'navimow.0.info.connection',
  });
  assert.deepEqual(result.rooms.find((r) => r.id === 'garten'), { id: 'garten', name: 'Garten', icon: 'trees' });
});

test('"all lights off" scene, sorting and room list', () => {
  const off = result.scenes[0];
  assert.equal(off.id, 'alle_lichter_aus');
  assert.equal(off.actions.some((a) => a.state.includes('Kaffee')), false, 'the coffee machine is not a light');
  assert.ok(off.actions.some((a) => a.state === 'hm-rpc.0.DIM1.1.LEVEL' && a.value === 0), 'dimmers are switched off via their level');
  const rooms = result.rooms.map((r) => r.name);
  assert.deepEqual(rooms, [...rooms].sort((a, b) => a.localeCompare(b, 'de')));
  assert.deepEqual(result.rooms.find((r) => r.id === 'kueche'), { id: 'kueche', name: 'Küche', icon: 'cooking' });
  const ids = result.devices.map((d) => d.room);
  assert.deepEqual(ids, [...ids].sort((a, b) => a.localeCompare(b)), 'devices are grouped by room');
});
