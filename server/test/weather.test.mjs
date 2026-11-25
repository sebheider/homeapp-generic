// Weather: normalising the Open-Meteo response, caching / stale fallback, config sanitising.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WeatherService, normalizeForecast, demoForecast, sanitizeWeather, validCoords } from '../src/weather.js';

const RAW = {
  timezone: 'Europe/Berlin',
  elevation: 12,
  current: { time: 1000, temperature_2m: 10.34, apparent_temperature: 8, relative_humidity_2m: 80, pressure_msl: 1012.3, wind_speed_10m: 11, wind_gusts_10m: 20, wind_direction_10m: 270, precipitation: 0, cloud_cover: 40, weather_code: 2, is_day: 1, uv_index: 2.46 },
  hourly: { time: [3600, 7200], temperature_2m: [10, 11], precipitation_probability: [10, null], precipitation: [0, 0.2], weather_code: [1, 61], uv_index: [1.2, 0], is_day: [1, 0] },
  daily: { time: [0], weather_code: [3], temperature_2m_max: [12], temperature_2m_min: [4], sunrise: [100], sunset: [900], daylight_duration: [800], uv_index_max: [3], precipitation_sum: [0], precipitation_probability_max: [5], wind_speed_10m_max: [20] },
  minutely_15: { time: [900, 1800, 2700], precipitation: [0, 0.1, null] },
};

test('normalizeForecast: columns become rows, numbers are rounded', () => {
  const f = normalizeForecast(RAW, 5);
  assert.equal(f.current.temp, 10.3);
  assert.equal(f.current.uv, 2.5);
  assert.equal(f.current.isDay, true);
  assert.equal(f.hourly.length, 2);
  assert.deepEqual(f.hourly[1], { t: 7200, temp: 11, pop: null, precip: 0.2, code: 61, uv: 0, isDay: false });
  assert.equal(f.daily[0].sunset, 900);
  // entries without a value are dropped from the nowcast
  assert.equal(f.nowcast.length, 2);
});

test('normalizeForecast: tolerates missing blocks', () => {
  const f = normalizeForecast({ timezone: 'UTC' });
  assert.deepEqual([f.hourly, f.daily, f.nowcast], [[], [], []]);
});

test('demoForecast has the same shape', () => {
  const f = demoForecast(Date.UTC(2026, 5, 1, 12));
  assert.equal(f.daily.length, 4);
  assert.ok(f.hourly.length >= 48 && f.nowcast.length === 12);
  assert.ok(f.daily[0].sunrise < f.daily[0].sunset);
});

test('validCoords', () => {
  assert.deepEqual(validCoords('48.1', '11.5'), { lat: 48.1, lon: 11.5 });
  assert.equal(validCoords(null, 11), null);
  assert.equal(validCoords('', ''), null);
  assert.equal(validCoords(91, 0), null);
  assert.equal(validCoords(0, 181), null);
  assert.equal(validCoords('abc', 1), null);
});

test('sanitizeWeather: coordinates, unit and only known datapoint keys', () => {
  const w = sanitizeWeather({ latitude: '53.55', longitude: 'x', windUnit: 'mph', radar: false, name: 'A'.repeat(200), states: { temperature: ' a.b ', bogus: 'x', uv: '' } });
  assert.equal(w.latitude, null);
  assert.equal(w.longitude, null);
  assert.equal(w.windUnit, 'kmh');
  assert.equal(w.radar, false);
  assert.equal(w.name.length, 80);
  assert.deepEqual(w.states, { temperature: 'a.b' });
  assert.equal(sanitizeWeather({ latitude: 53.55, longitude: 10, windUnit: 'ms' }).windUnit, 'ms');
});

const jsonResponse = (body, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body });

test('forecast is cached, de-duplicated and served stale when the internet fails', async () => {
  let calls = 0;
  let fail = false;
  const svc = new WeatherService(async () => {
    calls++;
    return fail ? jsonResponse({}, false) : jsonResponse(RAW);
  });
  const [a, b] = await Promise.all([svc.forecast(48.14, 11.58), svc.forecast(48.14, 11.58)]);
  assert.equal(calls, 1);
  assert.equal(a.current.temp, b.current.temp);
  await svc.forecast(48.14, 11.58);
  assert.equal(calls, 1);
  // expire the entry, then fail: the old data comes back marked as stale
  for (const v of svc.cache.values()) v.at -= 3600 * 1000;
  fail = true;
  const stale = await svc.forecast(48.14, 11.58);
  assert.equal(stale.stale, true);
  assert.equal(stale.current.temp, 10.3);
  // a location without cached data reports the error
  await assert.rejects(svc.forecast(1, 1));
});

test('geocode maps results and ignores short queries', async () => {
  const svc = new WeatherService(async () => jsonResponse({ results: [{ name: 'Hamburg', admin1: 'Hamburg', country: 'Deutschland', latitude: 53.55073, longitude: 9.99302, elevation: 9 }] }));
  assert.deepEqual(await svc.geocode('H'), []);
  const r = await svc.geocode('Hamburg');
  assert.deepEqual(r[0], { name: 'Hamburg', region: 'Hamburg, Deutschland', latitude: 53.5507, longitude: 9.993, elevation: 9 });
  assert.deepEqual(await new WeatherService(async () => jsonResponse({})).geocode('Nirgendwo'), []);
});

test('radar index lists frames oldest first', async () => {
  const svc = new WeatherService(async () => jsonResponse({ host: 'https://tiles', radar: { past: [{ time: 1, path: '/a' }], nowcast: [{ time: 2, path: '/b' }] } }));
  const r = await svc.radar();
  assert.equal(r.host, 'https://tiles');
  assert.deepEqual(r.frames.map((f) => f.time), [1, 2]);
});
