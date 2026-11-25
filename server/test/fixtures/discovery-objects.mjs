// Small but representative ioBroker object list for the discovery tests:
// Hue, Homematic (hm-rpc), E3/DC, Daikin cloud (air conditioner + Altherma), the WeatherMan station and a Navimow mower.

const DAIKIN_AC = 'daikin-cloud.0.12345678-1234-1234-1234-123456789abc';
const DAIKIN_HP = 'daikin-cloud.0.abcdefab-cdef-abcd-efab-cdefabcdefab';
const NAVIMOW = 'navimow.0.S4REA2532K1983';

const list = [
  // Hue: dimmable lamp, plug (coffee machine), entertainment area (ignored), room scene button
  { id: 'hue.0.Stehlampe.on', name: 'Stehlampe.on', role: 'switch.light', type: 'boolean', write: true },
  { id: 'hue.0.Stehlampe.reachable', name: 'Stehlampe.reachable', role: 'indicator.reachable', type: 'boolean' },
  { id: 'hue.0.Stehlampe.level', name: 'Stehlampe.level', role: 'level.dimmer', type: 'number', write: true },
  { id: 'hue.0.Kaffee_Steckdose.on', name: 'Kaffee Steckdose.on', role: 'switch.light', type: 'boolean', write: true },
  { id: 'hue.0.Kaffee_Steckdose.reachable', name: 'Kaffee Steckdose.reachable', role: 'indicator.reachable', type: 'boolean' },
  { id: 'hue.0.Esstisch.on', name: 'Esstisch.on', role: 'switch.light', type: 'boolean', write: true },
  { id: 'hue.0.Esstisch.reachable', name: 'Esstisch.reachable', role: 'indicator.reachable', type: 'boolean' },
  { id: 'hue.0.Esstisch.bri', name: 'Esstisch.bri', role: 'level.dimmer', type: 'number', write: true },
  { id: 'hue.0.TV_Entertainment.on', name: 'TV Entertainment.on', role: 'switch.light', type: 'boolean', write: true },
  { id: 'hue.0.TV_Entertainment.reachable', name: 'TV Entertainment.reachable', role: 'indicator.reachable', type: 'boolean' },
  { id: 'hue.0.Bridge.Wohnzimmer.scene_Nachtlicht', name: 'Scene Nachtlicht', role: 'button', type: 'boolean', write: true },
  { id: 'hue.0.Bridge.Esszimmer.scene_Lesen', name: 'Scene Lesen', role: 'button', type: 'boolean', write: true },

  // Homematic: thermostat with humidity
  { id: 'hm-rpc.0.THERM1.1.SET_POINT_TEMPERATURE', name: 'EG - Küche - Heizung:1.SET_POINT_TEMPERATURE', role: 'level.temperature', type: 'number', write: true, min: 4.5, max: 30.5 },
  { id: 'hm-rpc.0.THERM1.1.ACTUAL_TEMPERATURE', name: 'EG - Küche - Heizung:1.ACTUAL_TEMPERATURE', role: 'value.temperature', type: 'number' },
  { id: 'hm-rpc.0.THERM1.1.HUMIDITY', name: 'EG - Küche - Heizung:1.HUMIDITY', role: 'value.humidity', type: 'number' },
  // blinds: same room name on two floors -> floor appended
  { id: 'hm-rpc.0.BLIND1.4.LEVEL', name: 'EG - Flur - Rollade:4.LEVEL', role: 'level.blind', type: 'number', write: true },
  { id: 'hm-rpc.0.BLIND1.3.LEVEL', name: 'EG - Flur - Rollade:3.LEVEL', role: 'level.blind', type: 'number', write: false },
  { id: 'hm-rpc.0.BLIND2.4.LEVEL', name: 'KG - Flur - Rollade:4.LEVEL', role: 'level.blind', type: 'number', write: true },
  { id: 'hm-rpc.0.BLIND2.3.LEVEL', name: 'KG - Flur - Rollade:3.LEVEL', role: 'level.blind', type: 'number', write: false },
  // a LEVEL on channel 4 without a blind transmitter is ignored
  { id: 'hm-rpc.0.OTHER.4.LEVEL', name: 'EG - Flur - Sonstwas:4.LEVEL', role: 'level', type: 'number', write: true },
  // two-channel switch actuator, room name prefix is stripped; heating actuator is ignored
  { id: 'hm-rpc.0.SW1.3.STATE', name: 'EG - Wohnzimmer - Wohnzimmer Schrank:3.STATE', role: 'switch', type: 'boolean', write: true },
  { id: 'hm-rpc.0.SW1.4.STATE', name: 'EG - Wohnzimmer - Wohnzimmer Schrank:4.STATE', role: 'switch', type: 'boolean', write: true },
  { id: 'hm-rpc.0.HEAT1.3.STATE', name: 'KG - Technik - Heizaktor:3.STATE', role: 'switch', type: 'boolean', write: true },
  // dimmer
  { id: 'hm-rpc.0.DIM1.1.LEVEL', name: 'OG - Schlafzimmer - Stehlampe:1.LEVEL', role: 'level.dimmer', type: 'number', write: true, max: 1.01 },
  // brightness sensor without room, stand-alone temperature sensor with humidity
  { id: 'hm-rpc.0.LUX1.1.AVERAGE_ILLUMINATION', name: 'Helligkeitssensor', role: 'value.brightness', type: 'number' },
  { id: 'hm-rpc.0.TEMP1.1.TEMPERATURE', name: 'Temperatursensor', role: 'value.temperature', type: 'number' },
  { id: 'hm-rpc.0.TEMP1.1.HUMIDITY', name: 'Temperatursensor Feuchte', role: 'value.humidity', type: 'number' },

  // E3/DC
  { id: 'e3dc-rscp.0.EMS.POWER_PV', name: 'PV', role: 'value.power', type: 'number' },
  { id: 'e3dc-rscp.0.EMS.POWER_HOME', name: 'Haus', role: 'value.power', type: 'number' },
  { id: 'e3dc-rscp.0.EMS.POWER_GRID', name: 'Netz', role: 'value.power', type: 'number' },
  { id: 'e3dc-rscp.0.EMS.BAT_SOC', name: 'SoC', role: 'value.battery', type: 'number' },

  // Daikin air conditioner
  { id: `${DAIKIN_AC}.climateControl.onOffMode`, name: 'onOffMode', type: 'string', write: true },
  { id: `${DAIKIN_AC}.climateControl.operationMode`, name: 'operationMode', type: 'string', write: true, states: { heating: 'heating', cooling: 'cooling', fanOnly: 'fanOnly', special: 'special' } },
  { id: `${DAIKIN_AC}.climateControl.sensoryData.roomTemperature`, name: 'room', type: 'number' },
  { id: `${DAIKIN_AC}.climateControl.temperatureControl.operationModes.heating.setpoints.roomTemperature`, name: 'heat', type: 'number', write: true },
  { id: `${DAIKIN_AC}.climateControl.temperatureControl.operationModes.cooling.setpoints.roomTemperature`, name: 'cool', type: 'number', write: true },
  { id: `${DAIKIN_AC}.climateControl.fanControl.operationModes.cooling.fanSpeed.currentMode`, name: 'fan', type: 'string', write: true, states: { auto: 'auto', quiet: 'quiet', turbo: 'turbo' } },

  // Daikin Altherma heat pump
  { id: `${DAIKIN_HP}.climateControlMainZone.onOffMode`, name: 'onOffMode', type: 'string', write: true },
  { id: `${DAIKIN_HP}.climateControlMainZone.operationMode`, name: 'operationMode', type: 'string', write: true, states: { heating: 'heating', auto: 'auto' } },
  { id: `${DAIKIN_HP}.domesticHotWaterTank.onOffMode`, name: 'dhw', type: 'string', write: true },
  { id: `${DAIKIN_HP}.domesticHotWaterTank.temperatureControl.operationModes.heating.setpoints.domesticHotWaterTemperature`, name: 'dhw target', type: 'number', write: true, min: 30, max: 60 },

  // WeatherMan station
  { id: 'mqtt.0.WeatherMan.temperatur', name: 'temperatur', type: 'number' },
  { id: 'mqtt.0.WeatherMan.wind_spitze', name: 'wind_spitze', type: 'number' },
  { id: 'mqtt.0.WeatherMan.lux', name: 'lux', type: 'number' },

  // Navimow mower (navimow adapter with the map switched on); the map picture itself is not used
  ...[
    ['status.vehicleState', 'string'], ['status.battery', 'number'], ['status.timestamp', 'number'], ['status.state', 'string'],
    ['location.mowingPercentage', 'number'], ['location.subtotalArea', 'number'], ['location.mowingWeekArea', 'number'],
    ['location.postureX', 'number'], ['location.postureY', 'number'], ['location.postureTheta', 'number'], ['location.time', 'number'],
    ['mapTrack', 'string'], ['mapFrame', 'string'], ['dockPosition', 'string'], ['map', 'string'],
    ['general.name', 'string'], ['general.model', 'string'], ['general.firmware', 'string'],
    ['remote.start', 'boolean'], ['remote.pause', 'boolean'], ['remote.resume', 'boolean'], ['remote.stop', 'boolean'],
    ['remote.dock', 'boolean'], ['remote.Refresh', 'boolean'], ['remote.resetMap', 'boolean'],
  ].map(([suffix, type]) => ({ id: `${NAVIMOW}.${suffix}`, name: suffix, type, write: suffix.startsWith('remote.') || suffix === 'dockPosition' })),
  { id: 'navimow.0.info.connection', name: 'Device or service connected', role: 'indicator.connected', type: 'boolean' },
];

/** ioBroker objects as `discover()` expects them (id -> object). */
export const objects = new Map(list.map((o) => [o.id, o]));

/** Fake state reader: the Daikin air conditioner and the mower have a name state. */
export const read = async (id) => ({ [`${DAIKIN_AC}.climateControl.name`]: 'Büro', [`${NAVIMOW}.general.name`]: 'Navimow i105' })[id];
