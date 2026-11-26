/**
 * Configuration store.
 *
 * The configuration lives in `<DATA_DIR>/config.json` (a Docker volume, so it
 * survives container updates). Three views of it exist:
 *   - `raw`       what is stored in the file,
 *   - `effective` raw + environment defaults (+ demo content in demo mode); used by the app. It is
 *                 computed once and cached until the file or the environment changes – treat it as read-only,
 *   - `publicConfig()` / `editableConfig()`  effective / editable values without any secret, for the browser.
 *
 * Environment variables (all optional) only provide DEFAULTS – see README for the full table:
 *   IOBROKER_HOST, IOBROKER_MODE, IOBROKER_PORT, IOBROKER_SECURE, IOBROKER_PROTOCOL, IOBROKER_USER,
 *   IOBROKER_PASSWORD, IOBROKER_VERIFY_SSL, DEMO_MODE,
 *   SS_HOST, SS_PORT, SS_HTTPS, SS_ACCOUNT, SS_PASSWORD, SS_DEVICE_ID, SS_VERIFY_SSL
 *
 * Precedence: whatever was set by hand in the settings page is the master. The fields that were set
 * by hand are remembered in `userSet` (persisted in config.json); only the other fields follow the
 * environment. Secrets have no flag: a stored non-empty secret wins, otherwise the environment's applies.
 * Fields can be handed back to the environment with `resetEnv` (see {@link ConfigStore#update}).
 *
 * Modules (this file only re-exports their public API):
 *   config/paths.js      DATA_DIR and the config file
 *   config/defaults.js   default configuration, allowed values of the app settings
 *   config/env.js        environment defaults and the fields set by hand
 *   config/effective.js  effective configuration, state ids, masked secrets
 *   config/store.js      ConfigStore: load, persist, update
 */
export { DATA_DIR } from './config/paths.js';
export { POPUP_POSITIONS, POPUP_SIZES, refreshSeconds } from './config/defaults.js';
export { applyEnv, envSources, inferUserSet } from './config/env.js';
export { ConfigStore } from './config/store.js';
