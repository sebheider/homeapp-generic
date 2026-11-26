/**
 * HTTP endpoints of the external modules: administration and the sandboxed module files.
 */
import express from 'express';
import { isObj } from '../util/object.js';
import { ExtensionError } from './fields.js';
import { MANIFEST_VERSION } from './manifest.js';
import { MAX_PACKAGE_BYTES } from './package.js';

/**
 * Module pages run with an opaque origin: they can neither read the app's storage nor call its API
 * with the user's session. The same sandbox applies when a module file is opened directly.
 */
export const SANDBOX_CSP = "sandbox allow-scripts allow-forms; frame-ancestors 'self'";

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
