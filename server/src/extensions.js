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
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import express from 'express';

export const MANIFEST_VERSION = 1;
export const MANIFEST_FILE = 'module.json';
export const MAX_PACKAGE_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 200;
const MAX_UNPACKED_BYTES = 20 * 1024 * 1024;
const MAX_PATH = 200;
const MAX_SETTINGS = 30;
const MAX_CARDS = 40;

/** Ids that would be confusing next to the pages and built-in modules of the app. */
const RESERVED_IDS = new Set([
  'home', 'weather', 'rooms', 'lights', 'climate', 'energy', 'cameras', 'spotify', 'printer', 'mower', 'radar', 'settings',
  'modules', 'module', 'extensions', 'extension', 'homeapp', 'api', 'demo', 'iobroker', 'homeassistant', 'kiosk',
]);

/** File types a package may contain; they are served with exactly this content type. */
export const ASSET_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

export const SETTING_TYPES = ['datapoint', 'text', 'number', 'boolean', 'select'];
export const CARD_TYPES = ['value', 'switch', 'slider', 'button', 'text'];

/**
 * Module pages run with an opaque origin: they can neither read the app's storage nor call its API
 * with the user's session. The same sandbox applies when a module file is opened directly.
 */
export const SANDBOX_CSP = "sandbox allow-scripts allow-forms; frame-ancestors 'self'";

/** Error with a message that is shown to the admin as is. */
export class ExtensionError extends Error {}
const fail = (msg) => {
  throw new ExtensionError(msg);
};

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Optional or required text field of the manifest, trimmed. */
function text(v, field, { max, required = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) fail(`"${field}" fehlt`);
    return '';
  }
  if (typeof v !== 'string') fail(`"${field}" muss ein Text sein`);
  const s = v.trim();
  if (required && !s) fail(`"${field}" darf nicht leer sein`);
  if (s.length > max) fail(`"${field}" darf höchstens ${max} Zeichen lang sein`);
  return s;
}

function number(v, field) {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`"${field}" muss eine Zahl sein`);
  return v;
}

function bool(v, field) {
  if (v === undefined || v === null) return false;
  if (typeof v !== 'boolean') fail(`"${field}" muss true oder false sein`);
  return v;
}

function list(v, field, max) {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) fail(`"${field}" muss eine Liste sein`);
  if (v.length > max) fail(`"${field}" darf höchstens ${max} Einträge haben`);
  return v;
}

/**
 * Relative path inside a package ("index.html", "assets/app.js"), normalised to forward slashes;
 * null for absolute paths, parent references and unusual characters.
 */
export function safePath(name) {
  if (typeof name !== 'string' || !name || name.length > MAX_PATH) return null;
  const clean = name.replace(/\\/g, '/');
  if (clean.startsWith('/') || /^[a-zA-Z]:/.test(clean)) return null;
  const parts = clean.split('/').filter((p) => p !== '' && p !== '.');
  if (!parts.length || parts.some((p) => !/^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(p))) return null;
  return parts.join('/');
}

/** File name extension in lower case (".html"). */
const extOf = (file) => path.posix.extname(file).toLowerCase();

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

/* ------------------------------------------------------------------ packages */

const isZip = (buf) => buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50;

/**
 * Minimal ZIP reader (stored and deflated entries) with limits against oversized or hostile archives.
 * @returns {Map<string, Buffer>} relative path -> content
 */
export function unzip(buf, { maxFiles = MAX_FILES, maxBytes = MAX_UNPACKED_BYTES } = {}) {
  const broken = () => fail('Das ZIP-Paket ist beschädigt');
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) broken();
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || p === 0xffffffff) fail('ZIP64-Pakete werden nicht unterstützt');
  if (count > maxFiles * 2) fail(`Das Paket enthält zu viele Dateien (höchstens ${maxFiles})`);
  const files = new Map();
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) broken();
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    const rawName = buf.subarray(p + 46, p + 46 + nameLen);
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    const name = rawName.toString(flags & 0x800 ? 'utf8' : 'latin1').replace(/\\/g, '/');
    if (name.endsWith('/')) continue; // folder entry
    // metadata of macOS and hidden files are not part of the module ("." and ".." are refused below)
    if (name.startsWith('__MACOSX/') || name.split('/').some((s) => s.startsWith('.') && s !== '.' && s !== '..')) continue;
    if (flags & 1) fail('Verschlüsselte ZIP-Pakete werden nicht unterstützt');
    const rel = safePath(name);
    if (!rel) fail(`Unzulässiger Dateiname im Paket: "${name}" (erlaubt: Buchstaben, Ziffern, . _ - und Unterordner)`);
    if (files.has(rel)) fail(`Die Datei "${rel}" ist doppelt im Paket`);
    if (files.size >= maxFiles) fail(`Das Paket enthält zu viele Dateien (höchstens ${maxFiles})`);
    total += usize;
    if (total > maxBytes) fail(`Das entpackte Paket ist größer als ${Math.round(maxBytes / 1024 / 1024)} MB`);
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) broken();
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    if (start + csize > buf.length) broken();
    const data = buf.subarray(start, start + csize);
    let content;
    if (method === 0) content = Buffer.from(data);
    else if (method === 8) {
      try {
        content = zlib.inflateRawSync(data, { maxOutputLength: Math.max(1, usize) });
      } catch {
        broken();
      }
    } else fail(`Die Datei "${rel}" nutzt ein nicht unterstütztes Komprimierungsverfahren`);
    if (content.length !== usize || (typeof zlib.crc32 === 'function' && zlib.crc32(content) >>> 0 !== crc)) broken();
    files.set(rel, content);
  }
  return files;
}

/** A package zipped together with its folder ("pool/module.json") is used as if zipped from inside. */
function stripFolder(files) {
  if (files.has(MANIFEST_FILE)) return files;
  const firsts = new Set([...files.keys()].map((f) => f.split('/')[0]));
  if (firsts.size !== 1) return files;
  const [top] = firsts;
  if (!files.has(`${top}/${MANIFEST_FILE}`)) return files;
  return new Map([...files].map(([k, v]) => [k.slice(top.length + 1), v]));
}

/** Files of a package: a ZIP archive or a single module.json (modules made of cards only). */
export function readPackage(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) fail('Die Datei ist leer');
  if (buffer.length > MAX_PACKAGE_BYTES) fail(`Das Paket ist größer als ${MAX_PACKAGE_BYTES / 1024 / 1024} MB`);
  const files = isZip(buffer) ? stripFolder(unzip(buffer)) : new Map([[MANIFEST_FILE, buffer]]);
  const raw = files.get(MANIFEST_FILE);
  if (!raw) fail('module.json fehlt im Paket (es muss im obersten Ordner liegen)');
  let json;
  try {
    json = JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, ''));
  } catch (err) {
    fail(isZip(buffer) ? `module.json ist kein gültiges JSON: ${err.message}` : 'Die Datei ist weder ein ZIP-Paket noch eine gültige module.json');
  }
  for (const f of files.keys()) {
    if (!ASSET_TYPES[extOf(f)]) fail(`Dateityp nicht erlaubt: "${f}" (erlaubt: ${Object.keys(ASSET_TYPES).join(' ')})`);
  }
  return { manifest: validateManifest(json, new Set(files.keys())), files };
}

/** All files below a folder as relative paths with forward slashes. */
function listFiles(dir, prefix = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...listFiles(path.join(dir, e.name), rel));
    else if (e.isFile()) out.push(rel);
  }
  return out;
}

/* ------------------------------------------------------------------ registry */

/**
 * Installed external modules. `load()` reads the modules folder (also folders copied there by hand);
 * broken packages are listed with their error instead of being skipped silently.
 */
export class ExtensionRegistry {
  /** @type {Map<string, {id: string, manifest: object|null, error: string|null}>} */
  items = new Map();

  constructor({ dir }) {
    this.dir = dir;
  }

  load() {
    fs.mkdirSync(this.dir, { recursive: true });
    this.items.clear();
    for (const e of fs.readdirSync(this.dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const folder = path.join(this.dir, e.name);
      // left over by an interrupted installation
      if (e.name.startsWith('.')) {
        fs.rmSync(folder, { recursive: true, force: true });
        continue;
      }
      try {
        const json = JSON.parse(fs.readFileSync(path.join(folder, MANIFEST_FILE), 'utf8').replace(/^\uFEFF/, ''));
        const manifest = validateManifest(json, new Set(listFiles(folder)));
        if (manifest.id !== e.name) fail(`Der Ordner "${e.name}" muss wie die Modul-ID "${manifest.id}" heißen`);
        this.items.set(e.name, { id: e.name, manifest, error: null });
      } catch (err) {
        const msg = err.code === 'ENOENT' ? 'module.json fehlt' : err.message;
        this.items.set(e.name, { id: e.name, manifest: null, error: msg });
      }
    }
    return this;
  }

  /** Every installed module, also broken ones (`error`), sorted by name. */
  list() {
    return [...this.items.values()].sort((a, b) => (a.manifest?.name ?? a.id).localeCompare(b.manifest?.name ?? b.id, 'de'));
  }

  /** Manifests of the modules that can be used. */
  manifests() {
    return this.list().filter((i) => i.manifest).map((i) => i.manifest);
  }

  get(id) {
    return this.items.get(id)?.manifest ?? null;
  }

  /**
   * Installs or updates a module from a package (ZIP or module.json). The files are written to a
   * temporary folder first and swapped in, so a failed installation leaves the old version intact.
   */
  install(buffer) {
    const { manifest, files } = readPackage(buffer);
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = path.join(this.dir, `.tmp-${crypto.randomBytes(6).toString('hex')}`);
    const target = path.join(this.dir, manifest.id);
    const previous = this.items.get(manifest.id)?.manifest?.version ?? null;
    try {
      for (const [rel, content] of files) {
        const file = path.join(tmp, ...rel.split('/'));
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, content);
      }
      const old = fs.existsSync(target) ? path.join(this.dir, `.old-${crypto.randomBytes(6).toString('hex')}`) : null;
      if (old) fs.renameSync(target, old);
      try {
        fs.renameSync(tmp, target);
      } catch (err) {
        if (old) fs.renameSync(old, target);
        throw err;
      }
      if (old) fs.rmSync(old, { recursive: true, force: true });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    this.items.set(manifest.id, { id: manifest.id, manifest, error: null });
    return { manifest, previousVersion: previous };
  }

  /** Removes a module with all its files; false if it is not installed. */
  remove(id) {
    if (!this.items.has(id) || safePath(id) !== id || id.includes('/')) return false;
    fs.rmSync(path.join(this.dir, id), { recursive: true, force: true });
    this.items.delete(id);
    return true;
  }

  /** Absolute path and content type of a file of a usable module; null if it does not exist or is not allowed. */
  asset(id, rel) {
    if (!this.get(id)) return null;
    const clean = safePath(rel);
    const type = clean && ASSET_TYPES[extOf(clean)];
    if (!type) return null;
    const base = path.join(this.dir, id);
    const file = path.join(base, ...clean.split('/'));
    if (!file.startsWith(base + path.sep)) return null;
    try {
      return fs.statSync(file).isFile() ? { file, type } : null;
    } catch {
      return null;
    }
  }

  /**
   * Stored state of the modules (`config.extensions`): usable modules get clean values (disabled by
   * default), the entries of broken modules are kept unchanged until they are repaired or removed.
   */
  sanitizeConfig(input, previous = {}) {
    const src = isObj(input) ? input : {};
    const out = {};
    for (const [id, item] of this.items) {
      if (item.manifest) {
        const e = isObj(src[id]) ? src[id] : {};
        out[id] = { enabled: e.enabled === true, settings: sanitizeExtensionSettings(item.manifest, e.settings) };
      } else if (isObj(previous[id])) out[id] = previous[id];
    }
    return out;
  }

  /** Configuration of the usable modules only (what the app works with). */
  effectiveConfig(input) {
    return this.sanitizeConfig(input);
  }

  /** Datapoints mapped by the enabled modules; they are subscribed at the source and may be written. */
  stateIds(extensions) {
    const ids = [];
    for (const [id, e] of Object.entries(extensions || {})) {
      const manifest = this.get(id);
      if (!manifest || !e?.enabled) continue;
      for (const s of manifest.settings) if (s.type === 'datapoint' && e.settings?.[s.key]) ids.push(e.settings[s.key]);
    }
    return ids;
  }
}

/* ------------------------------------------------------------------ http */

/**
 * Admin endpoints and the files of the modules. Must be registered behind the access protection.
 *   GET    /api/extensions          installed modules (also broken ones with their error)
 *   POST   /api/extensions          install / update (body: ZIP package or module.json, max. 5 MB)
 *   DELETE /api/extensions/:id      remove with all files
 *   GET    /extensions/:id/<file>   files of a module, always inside the sandbox
 * @param {() => void} onChange called after a module was installed or removed
 */
export function registerExtensionRoutes(app, { registry, onChange }) {
  app.get('/api/extensions', (_req, res) => res.json({ extensions: registry.list(), manifestVersion: MANIFEST_VERSION }));

  app.post(
    '/api/extensions',
    express.raw({ type: () => true, limit: MAX_PACKAGE_BYTES }),
    (req, res) => {
      // a module.json sent as application/json was already parsed by the JSON body parser
      const body = Buffer.isBuffer(req.body) ? req.body : isObj(req.body) ? Buffer.from(JSON.stringify(req.body)) : Buffer.alloc(0);
      try {
        const result = registry.install(body);
        onChange();
        res.json({ ok: true, ...result });
      } catch (err) {
        res.status(err instanceof ExtensionError ? 400 : 500).json({ error: err.message });
      }
    },
    (err, _req, res, _next) => {
      res.status(err.status || 400).json({ error: err.type === 'entity.too.large' ? `Das Paket ist größer als ${MAX_PACKAGE_BYTES / 1024 / 1024} MB` : err.message });
    },
  );

  app.delete('/api/extensions/:id', (req, res) => {
    if (!registry.remove(req.params.id)) return res.status(404).json({ error: 'Modul nicht installiert' });
    onChange();
    res.json({ ok: true });
  });

  app.get('/extensions/:id/*', (req, res) => {
    const asset = registry.asset(req.params.id, req.params[0]);
    if (!asset) return res.status(404).type('text/plain').send('Nicht gefunden');
    res.set({
      'Content-Type': asset.type,
      'Content-Security-Policy': SANDBOX_CSP,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-cache',
    });
    // the path was checked above; a dot folder in DATA_DIR (e.g. ~/.homeapp) must not block it
    res.sendFile(asset.file, { dotfiles: 'allow' });
  });
}
