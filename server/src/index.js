/**
 * HomeApp server
 *
 * One Node.js process that
 *   1. talks to ioBroker (live states, setting states, object search),
 *   2. talks to the Synology Surveillance Station (cameras, snapshots, MJPEG, motion events),
 *   3. watches the 3D printer through OctoPrint or a Bambu Lab printer's LAN API (state, progress, webcam, pop-ups while printing),
 *   4. plays and controls music through Spotify Connect (Spotify Web API),
 *   5. receives the sensors of the wall displays (Raspberry Pi kiosk agent), reads the waste collection
 *      calendar and computes the ventilation advice,
 *   6. sends push notifications to phones via Pushover (notifications, waste, ventilation, printer, cameras),
 *   7. serves the built React frontend and the files of installed external modules (see extensions.js),
 *   8. pushes live changes to every open browser over a WebSocket (/ws).
 *
 * Credentials never reach the browser: the frontend only talks to this server.
 * Optional access protection: set APP_USER / APP_PASSWORD (HTTP Basic Auth).
 * HTTPS is enabled by default (plain http:// requests on the same port are redirected to https://);
 * set HTTPS=false for plain HTTP on the same port.
 *
 * This file starts the server; the parts live in app/:
 *   app/context.js       creates the integrations and holds the state they share (active source, alert rules)
 *   app/events.js        wires the integrations with each other, the live push and the push notifications
 *   app/notifications.js sends notifications to the browsers, the wall displays and the phones
 *   app/apply-config.js  (re)starts the integrations whenever the configuration is saved
 *   app/demo-kiosk.js    the simulated wall display of the demo mode
 *   app/live.js          WebSocket push to the browsers (/ws)
 *   app/http.js          the HTTP application; the authenticated endpoints live in api.js
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { basicAuth } from './auth.js';
import { DATA_DIR } from './config.js';
import { createServer, httpsEnabled } from './tls.js';
import { applyConfig } from './app/apply-config.js';
import { createContext } from './app/context.js';
import { DemoKiosk } from './app/demo-kiosk.js';
import { wireEvents } from './app/events.js';
import { createApp } from './app/http.js';
import { attachLivePush, createLivePush } from './app/live.js';
import { createAlertFanout } from './app/notifications.js';

const PORT = Number(process.env.PORT || 8080);
const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(process.env.PUBLIC_DIR || path.join(here, '..', '..', 'client', 'dist'));
const AUTH_USER = process.env.APP_USER || '';
const AUTH_PASS = process.env.APP_PASSWORD || '';

const authorized = basicAuth(AUTH_USER, AUTH_PASS);
const ctx = createContext();
const { store, history, kiosk } = ctx;
const live = createLivePush();
const demoKiosk = new DemoKiosk(ctx);
const alertFanout = createAlertFanout(ctx, live.broadcast);
wireEvents(ctx, { live, alertFanout, demoKiosk });

history.start(function* () {
  yield* ctx.source.states.entries();
  yield* kiosk.states.entries();
});

const app = createApp(ctx, { authorized, broadcast: live.broadcast, publicDir: PUBLIC_DIR });
const server = createServer(app, { dataDir: DATA_DIR });
// the agents send live radar frames while at least one browser shows the radar page
attachLivePush(server, live, { authorized, statusPayload: ctx.statusPayload, onRadarWatch: () => kiosk.watchRadar(live.radarWatched()) });

// configuration saved in the settings -> restart the integrations
const apply = () => applyConfig(ctx, { live, alertFanout, demoKiosk });
store.on('change', apply);
store.on('dashboard', (dashboard) => live.broadcast({ t: 'dashboard', dashboard }));
apply();
server.listen(PORT, () => {
  const mode = store.isDemo ? 'Demo' : store.effective.iobroker.mode === 'homeassistant' ? 'Home Assistant' : 'ioBroker';
  console.log(`HomeApp läuft auf ${httpsEnabled() ? 'https' : 'http'}://…:${PORT} (${mode})`);
  if (AUTH_USER || AUTH_PASS) console.log('Zugriffsschutz (Basic Auth) ist aktiv.');
});

// Graceful shutdown (docker stop): persist the history, then exit – at the latest after 2 s.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    history.stop();
    ctx.homeassistant.stop();
    ctx.iobroker.stop();
    ctx.demo.stop();
    ctx.alerts.stop();
    ctx.printer.stop();
    ctx.spotify.stop();
    ctx.waste.stop();
    ctx.ventilation.stop();
    kiosk.stop();
    demoKiosk.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
