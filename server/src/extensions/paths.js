/**
 * File paths inside a module package.
 */
import path from 'node:path';

/** Longest relative path of a file in a package. */
export const MAX_PATH = 200;

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
export const extOf = (file) => path.posix.extname(file).toLowerCase();
