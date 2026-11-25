/** Datapoints of a local weather station that can be mapped in the settings (key = server WEATHER_STATE_KEYS). */
export const WEATHER_FIELDS = [
  { key: 'temperature', label: 'Außentemperatur', unit: '°C' },
  { key: 'feelsLike', label: 'Gefühlte Temperatur / Windchill', unit: '°C' },
  { key: 'dewPoint', label: 'Taupunkt', unit: '°C' },
  { key: 'humidity', label: 'Luftfeuchte', unit: '%' },
  { key: 'pressure', label: 'Luftdruck', unit: 'hPa' },
  { key: 'windSpeed', label: 'Windgeschwindigkeit (Mittel)', unit: 'km/h' },
  { key: 'windGust', label: 'Windböen / Spitze', unit: 'km/h' },
  { key: 'windDir', label: 'Windrichtung (Grad)', unit: '°' },
  { key: 'rainToday', label: 'Regen heute', unit: 'mm' },
  { key: 'rainLastHour', label: 'Regen letzte Stunde', unit: 'mm' },
  { key: 'lux', label: 'Helligkeit', unit: 'lx' },
] as const;

/** Key of a mappable weather station datapoint. */
export type WeatherFieldKey = (typeof WEATHER_FIELDS)[number]['key'];
