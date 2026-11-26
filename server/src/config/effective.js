/**
 * Views derived from the stored configuration: the effective configuration the app works with, the state
 * ids it needs and the masked form for the browser.
 */
import { demoContent } from '../demo-content.js';
import { sanitizeModules } from '../modules.js';
import { ventilationStateIds } from '../ventilation.js';
import { applyEnv } from './env.js';

/** Effective configuration: stored values + environment defaults; in demo mode the sample installation. */
export function buildEffective(raw, userSet, extensions) {
  const cfg = applyEnv(raw, userSet);
  cfg.modules = sanitizeModules(cfg.modules);
  // only installed, valid external modules (disabled ones included, they are filtered where used)
  cfg.extensions = extensions ? extensions.sanitizeConfig(cfg.extensions) : {};
  if (cfg.iobroker.mode === 'demo') {
    const demo = demoContent();
    cfg.rooms = demo.rooms;
    cfg.devices = demo.devices;
    cfg.energy = demo.energy;
    cfg.scenes = demo.scenes;
    cfg.cameras = demo.cameras;
    cfg.weather = { ...cfg.weather, states: demo.weatherStates };
    // sample notifications, unless the user already defined own ones
    if (!cfg.alerts.length) cfg.alerts = demo.alerts;
  }
  if (!cfg.modules.weather) cfg.weather.enabled = false;
  if (!cfg.modules.mower) cfg.devices = cfg.devices.filter((device) => device.type !== 'mower');
  return cfg;
}

/**
 * Every state id a configuration refers to (devices, energy, weather, camera motion states, scene actions, alerts,
 * ventilation advice, datapoints of enabled external modules). Local kiosk datapoints (homeapp.kiosk.*) are included;
 * they are not requested from ioBroker.
 */
export function collectStateIds(cfg, extensions) {
  const ids = new Set();
  const add = (id) => id && ids.add(id);
  for (const d of cfg.devices) Object.values(d.states || {}).forEach(add);
  Object.values(cfg.energy?.states || {}).forEach(add);
  if (cfg.modules?.weather !== false) Object.values(cfg.weather?.states || {}).forEach(add);
  for (const c of cfg.cameras) {
    add(c.motionState);
    add(c.peopleState);
  }
  for (const s of cfg.scenes) for (const a of s.actions || []) add(a.state);
  for (const a of cfg.alerts || []) add(a.state);
  ventilationStateIds(cfg).forEach(add);
  extensions?.stateIds(cfg.extensions).forEach(add);
  return ids;
}

/**
 * Replaces the secrets of a configuration (in place) by flags: `passwordSet` / `deviceIdSet` /
 * `apiKeySet` / `userSet` / `tokenSet` / `connected` tell the browser whether a value exists without revealing it.
 */
export function maskSecrets(cfg) {
  cfg.surveillance.passwordSet = Boolean(cfg.surveillance.password);
  delete cfg.surveillance.password;
  cfg.surveillance.deviceIdSet = Boolean(cfg.surveillance.deviceId);
  delete cfg.surveillance.deviceId;
  cfg.iobroker.passwordSet = Boolean(cfg.iobroker.password);
  delete cfg.iobroker.password;
  cfg.homeassistant.tokenSet = Boolean(cfg.homeassistant.token);
  delete cfg.homeassistant.token;
  cfg.octoprint.apiKeySet = Boolean(cfg.octoprint.apiKey);
  delete cfg.octoprint.apiKey;
  cfg.bambu.accessCodeSet = Boolean(cfg.bambu.accessCode);
  delete cfg.bambu.accessCode;
  cfg.spotify.connected = Boolean(cfg.spotify.refreshToken);
  delete cfg.spotify.refreshToken;
  cfg.pushover.userSet = Boolean(cfg.pushover.user);
  delete cfg.pushover.user;
  cfg.pushover.tokenSet = Boolean(cfg.pushover.token);
  delete cfg.pushover.token;
  return cfg;
}
