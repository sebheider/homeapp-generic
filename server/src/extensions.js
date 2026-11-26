/**
 * External modules ("Externe Module"): packages that extend the app without changing its code.
 *
 * The built-in modules (weather, 3D printer, Spotify, mower – see modules.js) are part of the app and
 * can only be switched off. External modules are installed at runtime through the settings page
 * (Einstellungen → Module) and live in `<DATA_DIR>/modules/<id>/`:
 *
 *   module.json   manifest (schema: docs/module.schema.json, description: docs/MODULES.md)
 *   index.html …  optional own page / widget, shown in a sandboxed iframe (opaque origin)
 *
 * A module never runs code on the server. It either describes its content with ready-made cards
 * (value, switch, slider, button, text) that the app renders itself, or brings an HTML page that
 * talks to the app only through `postMessage` (client/public/module-sdk.js). Which datapoints a module
 * sees is decided by the admin: the manifest declares setting slots of type `datapoint`, the admin
 * maps them to real ioBroker / Home Assistant ids. Enabled state and settings are stored in
 * config.json (`extensions`), the package files in the modules folder.
 *
 * Modules (this file only re-exports their public API):
 *   extensions/fields.js    checks of single manifest fields, ExtensionError
 *   extensions/paths.js     file paths inside a package
 *   extensions/manifest.js  manifest validation and setting values
 *   extensions/package.js   ZIP reader and package check
 *   extensions/registry.js  ExtensionRegistry: installed modules
 *   extensions/routes.js    admin endpoints and sandboxed module files
 */
export { ExtensionError } from './extensions/fields.js';
export { safePath } from './extensions/paths.js';
export { CARD_TYPES, MANIFEST_FILE, MANIFEST_VERSION, SETTING_TYPES, sanitizeExtensionSettings, validateManifest } from './extensions/manifest.js';
export { ASSET_TYPES, MAX_PACKAGE_BYTES, readPackage, unzip } from './extensions/package.js';
export { ExtensionRegistry } from './extensions/registry.js';
export { SANDBOX_CSP, registerExtensionRoutes } from './extensions/routes.js';
