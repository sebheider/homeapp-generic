/**
 * Module packages: a ZIP archive (or a single module.json) is read with limits against oversized or
 * hostile archives, its files are checked and its manifest validated.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fail } from './fields.js';
import { MANIFEST_FILE, validateManifest } from './manifest.js';
import { extOf, safePath } from './paths.js';

export const MAX_PACKAGE_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 200;
const MAX_UNPACKED_BYTES = 20 * 1024 * 1024;

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
export function listFiles(dir, prefix = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...listFiles(path.join(dir, e.name), rel));
    else if (e.isFile()) out.push(rel);
  }
  return out;
}
