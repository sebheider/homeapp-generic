/**
 * MQTT weather station "WeatherMan" (adapter `mqtt`): outdoor sensors and the datapoint mapping for the
 * weather block of the dashboard.
 */

/** Adds the sensors of the station. */
export function discoverWeatherStation({ byId, rooms, add }) {
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
}

/** Datapoints of the station for the weather block of the dashboard (datapoint key -> id). */
export function weatherStationStates({ byId }) {
  const wm = (name) => byId.get(`mqtt.0.WeatherMan.${name}`);
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
  return weatherStates;
}
