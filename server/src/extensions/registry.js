/**
 * The installed external modules in the modules folder: loading, installing, removing, their files and
 * their stored settings.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { isObj } from '../util/object.js';
import { fail } from './fields.js';
import { MANIFEST_FILE, sanitizeExtensionSettings, validateManifest } from './manifest.js';
import { ASSET_TYPES, listFiles, readPackage } from './package.js';
import { extOf, safePath } from './paths.js';

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
