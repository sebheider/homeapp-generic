/**
 * The HTTP application: the endpoints without login (health, camera webhook, kiosk agents), the access
 * protection, the external modules, the API of the app (api.js) and the files of the frontend.
 */
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { registerApiRoutes } from '../api.js';
import { blockForeignWrites, safeEqual } from '../auth.js';
import { discover } from '../discovery.js';
import { registerExtensionRoutes } from '../extensions.js';
import { registerKioskReport } from '../kiosk.js';
import { normalizeKind } from '../motion.js';
import { buildFixScript, controlIds } from '../permissions.js';
import { kindPopupAllowed } from '../popup-rules.js';
import { demoCoverSvg } from '../spotify.js';
import { demoForecast, validCoords } from '../weather.js';

// The start page, the service worker and the manifest must always be revalidated (app updates).
const NO_CACHE = /(index\.html|sw\.js|manifest\.webmanifest)$/;

/**
 * Creates the express application.
 * @param {ReturnType<import('./context.js').createContext>} ctx
 * @param {{authorized: (header: string|undefined) => boolean, broadcast: (msg: object) => void, publicDir: string}} opts
 *   `authorized` checks the Basic Auth header, `publicDir` holds the built frontend
 */
export function createApp(ctx, { authorized, broadcast, publicDir }) {
  const { store, extensions, motion, kiosk } = ctx;
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // Surveillance Station action rules call this without credentials, protected by the webhook token.
  //   /api/webhook/motion/<camera>?token=..            normal motion detection
  //   /api/webhook/people/<camera>?token=..            advanced detection (people)
  //   /api/webhook/motion/<camera>?token=..&type=people  same as the line above
  // <camera> is the camera id (e.g. 21) or its name (e.g. Terrasse).
  app.all('/api/webhook/:kind(motion|people)/:camera', (req, res) => {
    if (!safeEqual(String(req.query.token || ''), store.raw.webhookToken)) return res.status(403).json({ error: 'token' });
    const wanted = String(req.params.camera).trim().toLowerCase();
    const cam = ctx.cameraList().find((c) => c.id === wanted || c.name.toLowerCase() === wanted);
    if (!cam && !/^\d+$/.test(wanted)) return res.status(404).json({ error: 'Kamera unbekannt' });
    const kind = req.params.kind === 'people' ? 'people' : normalizeKind(req.query.type);
    const fired = motion.trigger({ cameraId: cam ? cam.id : wanted, source: 'Webhook', kind });
    res.json({ ok: true, fired, kind });
  });

  // The Raspberry Pi agents of the wall displays report their sensors with the kiosk token (see kiosk-agent/).
  registerKioskReport(app, { hub: kiosk, getToken: () => store.raw.kioskToken, getSettings: () => store.effective.kiosk });

  // Everything below requires the Basic Auth credentials (if configured).
  app.use((req, res, next) => {
    if (authorized(req.headers.authorization)) return next();
    res.set('WWW-Authenticate', 'Basic realm="HomeApp", charset="UTF-8"').status(401).send('Anmeldung erforderlich');
  });
  // other web sites and the sandboxed pages of external modules must not change anything
  app.use(blockForeignWrites);

  registerExtensionRoutes(app, { registry: extensions, onChange: () => store.extensionsChanged() });

  registerApiRoutes(app, {
    store,
    getSource: () => ctx.source,
    extensionManifests: () => extensions.manifests(),
    demo: ctx.demo,
    history: ctx.history,
    weather: ctx.weather,
    validCoords,
    demoForecast,
    discover,
    controlIds,
    buildFixScript,
    cameraList: ctx.cameraList,
    alerts: ctx.alerts,
    motion,
    printer: ctx.printer,
    spotify: ctx.spotify,
    surveillance: ctx.surveillance,
    kindPopupAllowed,
    statusPayload: ctx.statusPayload,
    broadcast,
    demoCoverSvg,
    kiosk,
    waste: ctx.waste,
    ventilation: ctx.ventilation,
    allAlerts: ctx.allAlerts,
    pushover: ctx.pushover,
  });

  // unknown API paths answer with JSON instead of the SPA fallback below
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Nicht gefunden' }));

  // Frontend: static files with an SPA fallback so that reloading any view works.
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir, { maxAge: '1h', setHeaders: (r, f) => NO_CACHE.test(f) && r.setHeader('Cache-Control', 'no-cache') }));
    app.get('*', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));
  } else {
    app.get('/', (_req, res) => res.send('HomeApp-Server läuft. Frontend nicht gebaut (client/dist fehlt).'));
  }
  return app;
}
