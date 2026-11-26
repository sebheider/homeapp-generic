/**
 * The manifest of an external module (module.json, schema version 1, see docs/MODULES.md) and the
 * values of its settings.
 */
import { isObj } from '../util/object.js';
import { bool, fail, list, number, text } from './fields.js';
import { MAX_PATH, extOf, safePath } from './paths.js';

export const MANIFEST_VERSION = 1;
export const MANIFEST_FILE = 'module.json';

const MAX_SETTINGS = 30;
const MAX_CARDS = 40;

/** Ids that would be confusing next to the pages and built-in modules of the app. */
const RESERVED_IDS = new Set([
  'home', 'weather', 'rooms', 'lights', 'climate', 'energy', 'cameras', 'spotify', 'printer', 'mower', 'radar', 'settings',
  'modules', 'module', 'extensions', 'extension', 'homeapp', 'api', 'demo', 'iobroker', 'homeassistant', 'kiosk',
]);

export const SETTING_TYPES = ['datapoint', 'text', 'number', 'boolean', 'select'];
export const CARD_TYPES = ['value', 'switch', 'slider', 'button', 'text'];

function entryPath(v, field, files) {
  const raw = text(v, field, { max: MAX_PATH, required: true });
  const rel = safePath(raw);
  if (!rel) fail(`"${field}" muss ein relativer Dateipfad im Paket sein`);
  if (extOf(rel) !== '.html') fail(`"${field}" muss auf eine .html-Datei zeigen`);
  if (files && !files.has(rel)) fail(`"${field}": Datei "${rel}" fehlt im Paket`);
  return rel;
}

/** One setting slot that the admin fills in (datapoint mapping, text, number, switch, choice). */
function validateSetting(s, i, keys) {
  const field = `settings[${i}]`;
  if (!isObj(s)) fail(`"${field}" muss ein Objekt sein`);
  const key = text(s.key, `${field}.key`, { max: 40, required: true });
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) fail(`"${field}.key" darf nur Buchstaben, Ziffern und _ enthalten und muss mit einem Buchstaben beginnen`);
  if (keys.has(key)) fail(`"${field}.key": "${key}" ist doppelt`);
  keys.add(key);
  if (!SETTING_TYPES.includes(s.type)) fail(`"${field}.type" muss einer der Werte ${SETTING_TYPES.join(', ')} sein`);
  const out = {
    key,
    type: s.type,
    label: text(s.label, `${field}.label`, { max: 60, required: true }),
    description: text(s.description, `${field}.description`, { max: 200 }),
    required: bool(s.required, `${field}.required`),
  };
  if (s.type === 'datapoint') out.write = bool(s.write, `${field}.write`);
  if (s.type === 'text') out.default = text(s.default, `${field}.default`, { max: 200 });
  if (s.type === 'boolean') out.default = bool(s.default, `${field}.default`);
  if (s.type === 'number') {
    const min = number(s.min, `${field}.min`);
    const max = number(s.max, `${field}.max`);
    if (min !== undefined && max !== undefined && min > max) fail(`"${field}": min ist größer als max`);
    const step = number(s.step, `${field}.step`);
    if (step !== undefined && step <= 0) fail(`"${field}.step" muss größer als 0 sein`);
    let def = number(s.default, `${field}.default`);
    if (def !== undefined && ((min !== undefined && def < min) || (max !== undefined && def > max))) fail(`"${field}.default" liegt außerhalb von min/max`);
    def ??= null;
    Object.assign(out, { default: def, unit: text(s.unit, `${field}.unit`, { max: 12 }) });
    if (min !== undefined) out.min = min;
    if (max !== undefined) out.max = max;
    if (step !== undefined) out.step = step;
  }
  if (s.type === 'select') {
    const options = list(s.options, `${field}.options`, 30).map((o, j) => {
      if (!isObj(o)) fail(`"${field}.options[${j}]" muss ein Objekt mit value und label sein`);
      return { value: text(o.value, `${field}.options[${j}].value`, { max: 60, required: true }), label: text(o.label, `${field}.options[${j}].label`, { max: 60, required: true }) };
    });
    if (!options.length) fail(`"${field}.options" braucht mindestens eine Auswahl`);
    if (new Set(options.map((o) => o.value)).size !== options.length) fail(`"${field}.options" enthält doppelte Werte`);
    const def = s.default === undefined ? options[0].value : s.default;
    if (!options.some((o) => o.value === def)) fail(`"${field}.default" ist keine der Auswahlmöglichkeiten`);
    Object.assign(out, { options, default: def });
  }
  return out;
}

/** One ready-made card of a page or widget; datapoints are referenced by their setting key. */
function validateCard(c, field, datapoints) {
  if (!isObj(c)) fail(`"${field}" muss ein Objekt sein`);
  if (!CARD_TYPES.includes(c.type)) fail(`"${field}.type" muss einer der Werte ${CARD_TYPES.join(', ')} sein`);
  const out = { type: c.type, label: text(c.label, `${field}.label`, { max: 60 }) };
  if (c.type === 'text') {
    out.text = text(c.text, `${field}.text`, { max: 1000, required: true });
    return out;
  }
  const key = text(c.datapoint, `${field}.datapoint`, { max: 40, required: true });
  const setting = datapoints.get(key);
  if (!setting) fail(`"${field}.datapoint": "${key}" ist keine Einstellung vom Typ "datapoint"`);
  if (c.type !== 'value' && !setting.write) fail(`"${field}": Einstellung "${key}" braucht "write": true, um schalten zu dürfen`);
  out.datapoint = key;
  if (c.type === 'value') {
    out.unit = text(c.unit, `${field}.unit`, { max: 12 });
    const decimals = number(c.decimals, `${field}.decimals`);
    if (decimals !== undefined) {
      if (!Number.isInteger(decimals) || decimals < 0 || decimals > 4) fail(`"${field}.decimals" muss eine ganze Zahl von 0 bis 4 sein`);
      out.decimals = decimals;
    }
  }
  if (c.type === 'slider') {
    const min = number(c.min, `${field}.min`) ?? 0;
    const max = number(c.max, `${field}.max`) ?? 100;
    const step = number(c.step, `${field}.step`) ?? 1;
    if (min >= max) fail(`"${field}": min muss kleiner als max sein`);
    if (step <= 0) fail(`"${field}.step" muss größer als 0 sein`);
    Object.assign(out, { min, max, step, unit: text(c.unit, `${field}.unit`, { max: 12 }) });
  }
  if (c.type === 'button') {
    if (!['string', 'number', 'boolean'].includes(typeof c.value) || (typeof c.value === 'number' && !Number.isFinite(c.value))) {
      fail(`"${field}.value" muss ein Text, eine Zahl oder true/false sein`);
    }
    if (typeof c.value === 'string' && c.value.length > 200) fail(`"${field}.value" darf höchstens 200 Zeichen lang sein`);
    out.value = c.value;
    out.confirm = text(c.confirm, `${field}.confirm`, { max: 120 });
  }
  return out;
}

/** Page (own entry in the navigation) or widget (start page): either an HTML entry or cards. */
function validatePart(p, where, datapoints, files) {
  if (p === undefined || p === null) return null;
  if (!isObj(p)) fail(`"${where}" muss ein Objekt sein`);
  const hasEntry = p.entry !== undefined;
  const hasCards = p.cards !== undefined;
  if (hasEntry === hasCards) fail(`"${where}" braucht genau eines von "entry" (eigene HTML-Datei) oder "cards" (fertige Kacheln)`);
  const out = {};
  if (where === 'page') out.title = text(p.title, 'page.title', { max: 40 });
  if (where === 'widget') {
    const size = p.size === undefined ? [4, 3] : p.size;
    if (!Array.isArray(size) || size.length !== 2 || !Number.isInteger(size[0]) || !Number.isInteger(size[1]) || size[0] < 1 || size[0] > 12 || size[1] < 1 || size[1] > 24) {
      fail('"widget.size" muss [Breite 1–12, Höhe 1–24] in Rasterfeldern sein');
    }
    out.size = size;
  }
  if (hasEntry) out.entry = entryPath(p.entry, `${where}.entry`, files);
  else {
    const cards = list(p.cards, `${where}.cards`, MAX_CARDS);
    if (!cards.length) fail(`"${where}.cards" braucht mindestens eine Kachel`);
    out.cards = cards.map((c, i) => validateCard(c, `${where}.cards[${i}]`, datapoints));
  }
  return out;
}

/**
 * Checks a manifest against schema version 1 and returns its clean form (unknown fields dropped).
 * @param {unknown} input parsed module.json
 * @param {Set<string>} [files] files of the package; entries must exist in it
 * @throws {ExtensionError} with a message that names the offending field
 */
export function validateManifest(input, files) {
  if (!isObj(input)) fail('module.json muss ein JSON-Objekt sein');
  if (input.manifestVersion !== MANIFEST_VERSION) fail(`"manifestVersion" muss ${MANIFEST_VERSION} sein (Schema-Version dieser App)`);
  const id = text(input.id, 'id', { max: 40, required: true });
  if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(id)) fail('"id" darf nur Kleinbuchstaben, Ziffern und - enthalten (2–40 Zeichen, Beginn mit Buchstabe)');
  if (RESERVED_IDS.has(id)) fail(`"id": "${id}" ist für die App reserviert`);
  const version = text(input.version, 'version', { max: 40, required: true });
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) fail('"version" muss eine Versionsnummer wie 1.0.0 sein');
  const homepage = text(input.homepage, 'homepage', { max: 200 });
  if (homepage && !/^https?:\/\/[^\s]+$/i.test(homepage)) fail('"homepage" muss eine http(s)-Adresse sein');
  const icon = text(input.icon, 'icon', { max: 30 }) || 'puzzle';
  if (!/^[a-zA-Z]+$/.test(icon)) fail('"icon" muss ein Symbolname aus Buchstaben sein');
  const keys = new Set();
  const settings = list(input.settings, 'settings', MAX_SETTINGS).map((s, i) => validateSetting(s, i, keys));
  const datapoints = new Map(settings.filter((s) => s.type === 'datapoint').map((s) => [s.key, s]));
  const page = validatePart(input.page, 'page', datapoints, files);
  const widget = validatePart(input.widget, 'widget', datapoints, files);
  if (!page && !widget) fail('Ein Modul braucht "page" (eigene Seite) und/oder "widget" (Startseiten-Widget)');
  return {
    manifestVersion: MANIFEST_VERSION,
    id,
    name: text(input.name, 'name', { max: 40, required: true }),
    version,
    description: text(input.description, 'description', { max: 300 }),
    author: text(input.author, 'author', { max: 80 }),
    homepage,
    icon,
    settings,
    page,
    widget,
  };
}

/** Values of the settings slots of one module: wrong types fall back to the manifest default. */
export function sanitizeExtensionSettings(manifest, input) {
  const src = isObj(input) ? input : {};
  const out = {};
  for (const s of manifest.settings) {
    const v = src[s.key];
    if (s.type === 'datapoint') out[s.key] = typeof v === 'string' ? v.trim().slice(0, 200) : '';
    else if (s.type === 'text') out[s.key] = typeof v === 'string' ? v.slice(0, 200) : s.default;
    else if (s.type === 'boolean') out[s.key] = typeof v === 'boolean' ? v : s.default;
    else if (s.type === 'select') out[s.key] = s.options.some((o) => o.value === v) ? v : s.default;
    else {
      const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
      out[s.key] = Number.isFinite(n) ? Math.min(s.max ?? Infinity, Math.max(s.min ?? -Infinity, n)) : s.default;
    }
  }
  return out;
}
