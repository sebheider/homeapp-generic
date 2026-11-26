/**
 * Environment variables as defaults of the configuration: which variable feeds which field, and which
 * fields were set by hand in the settings (those win over the environment).
 */
import { getPath, setPath } from '../util/object.js';
import { defaults } from './defaults.js';

/** Interprets typical truthy strings of environment variables. */
const bool = (v) => ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());

/** Environment variable -> configuration field, value type and whether it is a secret (never sent to the browser). */
const ENV_FIELDS = [
  ['IOBROKER_MODE', 'iobroker.mode', 'string'],
  ['IOBROKER_HOST', 'iobroker.host', 'string'],
  ['IOBROKER_PORT', 'iobroker.port', 'number'],
  ['IOBROKER_SECURE', 'iobroker.secure', 'bool'],
  ['IOBROKER_PROTOCOL', 'iobroker.protocol', 'string'],
  ['IOBROKER_USER', 'iobroker.user', 'string'],
  ['IOBROKER_PASSWORD', 'iobroker.password', 'string', true],
  ['IOBROKER_VERIFY_SSL', 'iobroker.verifySsl', 'bool'],
  ['HOMEASSISTANT_URL', 'homeassistant.url', 'string'],
  ['HOMEASSISTANT_TOKEN', 'homeassistant.token', 'string', true],
  ['HOMEASSISTANT_VERIFY_SSL', 'homeassistant.verifySsl', 'bool'],
  ['SS_HOST', 'surveillance.host', 'string'],
  ['SS_PORT', 'surveillance.port', 'number'],
  ['SS_HTTPS', 'surveillance.https', 'bool'],
  ['SS_ACCOUNT', 'surveillance.account', 'string'],
  ['SS_PASSWORD', 'surveillance.password', 'string', true],
  ['SS_DEVICE_ID', 'surveillance.deviceId', 'string', true],
  ['SS_VERIFY_SSL', 'surveillance.verifySsl', 'bool'],
];

/** Non-secret fields whose "set by hand" state is tracked (everything the environment can provide). */
export const TRACKED = [...ENV_FIELDS.filter((f) => !f[3]).map((f) => f[1]), 'surveillance.enabled'];

/** docker-compose passes unset variables as empty strings, so empty counts as "not set". */
const isSet = (v) => v !== undefined && v !== null && String(v).trim() !== '';
const convert = (type, v) => (type === 'number' ? Number(v) : type === 'bool' ? bool(v) : String(v).trim());

/**
 * Every default the environment currently provides, by field path.
 * @returns {Map<string, {env: string, value: string|number|boolean, secret: boolean}>}
 */
export function envSources(e = process.env) {
  const m = new Map();
  for (const [env, p, type, secret] of ENV_FIELDS) if (isSet(e[env])) m.set(p, { env, value: convert(type, e[env]), secret: Boolean(secret) });
  // a host variable implies "use it": live mode / Surveillance Station on
  if (isSet(e.IOBROKER_HOST) && !m.has('iobroker.mode')) m.set('iobroker.mode', { env: 'IOBROKER_HOST', value: 'socketio', secret: false });
  if (isSet(e.SS_HOST)) m.set('surveillance.enabled', { env: 'SS_HOST', value: true, secret: false });
  if (isSet(e.DEMO_MODE)) m.set('iobroker.mode', { env: 'DEMO_MODE', value: bool(e.DEMO_MODE) ? 'demo' : 'socketio', secret: false });
  return m;
}

/**
 * Configuration with the environment defaults applied to every field that was not set by hand.
 * @param {object} raw stored configuration
 * @param {Set<string>} userSet fields set by hand
 */
export function applyEnv(raw, userSet, e = process.env) {
  const cfg = structuredClone(raw);
  for (const [p, s] of envSources(e)) {
    const manual = s.secret ? Boolean(getPath(raw, p)) : userSet.has(p);
    if (!manual) setPath(cfg, p, s.value);
  }
  return cfg;
}

/** Fingerprint of the environment variables that feed {@link applyEnv} (constant in production, tests change them). */
export const envKey = (e = process.env) => [...ENV_FIELDS.map(([env]) => e[env] ?? ''), e.DEMO_MODE ?? ''].join('\u0000');

/** For config files from before the tracking existed: a stored value that differs from the default counts as set by hand. */
export function inferUserSet(raw) {
  const d = defaults();
  return new Set(TRACKED.filter((p) => String(getPath(raw, p)) !== String(getPath(d, p))));
}
