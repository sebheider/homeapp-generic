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
 *   7. serves the built React frontend,
 *   8. pushes live changes to every open browser over a WebSocket (/ws).
 *
 * Credentials never reach the browser: the frontend only talks to this server.
 * Optional access protection: set APP_USER / APP_PASSWORD (HTTP Basic Auth).
 * HTTPS is enabled by default (plain http:// requests on the same port are redirected to https://);
 * set HTTPS=false for plain HTTP on the same port.
 *
 * This file wires the integrations and WebSocket push, then starts the HTTP server.
 * Authenticated HTTP endpoints live in api.js.
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import { ConfigStore, DATA_DIR } from './config.js';
import { IoBrokerSource } from './iobroker.js';
import { DemoSource } from './demo.js';
import { SurveillanceClient } from './synology.js';
import { History } from './history.js';
import { MotionHub, normalizeKind } from './motion.js';
import { discover } from './discovery.js';
import { kindPopupAllowed } from './popup-rules.js';
import { buildFixScript, controlIds } from './permissions.js';
import { WeatherService, demoForecast, validCoords } from './weather.js';
import { basicAuth, safeEqual } from './auth.js';
import { buildCameraList } from './cameras.js';
import { AlertMonitor, jsonFileStore, sanitizeAlerts } from './alerts.js';
import { PrinterService } from './octoprint.js';
import { SpotifyService, demoCoverSvg } from './spotify.js';
import { createServer, httpsEnabled } from './tls.js';
import { registerApiRoutes } from './api.js';
import { KIOSK_PREFIX, KioskHub, demoKioskReport, demoRadarFrame, freshAlerts, isKioskId, registerKioskReport } from './kiosk.js';
import { WasteService } from './waste.js';
import { VentilationService } from './ventilation.js';
import { AlertTracker, PrintProgressTimer, PushoverService, alertEvent, printerMessage, printerProgressMessage } from './pushover.js';

const PORT = Number(process.env.PORT || 8080);
const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(process.env.PUBLIC_DIR || path.join(here, '..', '..', 'client', 'dist'));
const AUTH_USER = process.env.APP_USER || '';
const AUTH_PASS = process.env.APP_PASSWORD || '';
const PUSH_DELAY_MS = 80; // state changes are collected this long before they are pushed
const ALERT_WAKE_SETTLE_MS = 60 * 1000; // notifications do not wake the wall displays this long after (re)configuring
const HEARTBEAT_MS = 30000;
const DEMO_RADAR_MS = 250; // live frames of the simulated radar (like a real agent)

const authorized = basicAuth(AUTH_USER, AUTH_PASS);
const store = new ConfigStore(); // persisted configuration (+ environment overrides)
const iobroker = new IoBrokerSource(); // real ioBroker connection
const demo = new DemoSource(); // simulated installation for demo mode
const surveillance = new SurveillanceClient();
const history = new History(); // minute-resolution time series of numeric states
const weather = new WeatherService(); // internet forecast, place search, radar index
const printer = new PrinterService(); // 3D printer (OctoPrint or Bambu Lab, or a simulated one in demo mode)
const spotify = new SpotifyService(); // Spotify Connect (Web API, or a simulated player in demo mode)
const motion = new MotionHub(
  () => store.effective,
  (id) => cameraList().find((c) => c.id === String(id))?.name,
); // merges motion signals from all sources
/** The currently active state source: either `iobroker` or `demo`. */
let source = demo;
const kiosk = new KioskHub(); // local, read-only datapoints of the wall display agents (homeapp.kiosk.*)
/** Current value of any datapoint: kiosk sensors are local, everything else comes from the source. */
const valueOf = (id) => (isKioskId(id) ? kiosk.states.get(id) : source.states.get(id))?.val;
/** Alert rules of the current configuration (cached: they are checked on every state change). */
let alertRules = [];
const alerts = new AlertMonitor(
  () => alertRules,
  valueOf,
  jsonFileStore(path.join(DATA_DIR, 'alerts.json')), // unacknowledged alarms survive a restart
); // user-defined notifications
const waste = new WasteService({ dataDir: DATA_DIR }); // waste collection calendar (ICS) -> hints
const ventilation = new VentilationService({
  getConfig: () => store.effective,
  getValue: valueOf,
  // outdoor values when there is no weather station: current conditions of the internet weather
  fetchOutdoor: async () => {
    const w = store.effective.weather;
    const pos = validCoords(w?.latitude, w?.longitude);
    const f = pos ? await weather.forecast(pos.lat, pos.lon) : store.isDemo ? demoForecast() : null;
    return f ? { temperature: f.current.temp, humidity: f.current.humidity } : null;
  },
  // wall displays that ever reported CO₂ take part automatically (an offline one has no current value)
  getKioskAgents: () => kiosk.list().filter((a) => kiosk.states.has(`${KIOSK_PREFIX}${a.id}.co2`)),
});
const pushover = new PushoverService(); // push notifications to phones
/** Live notifications as last seen by the push notifications (new ones are sent, ended ones may send an all-clear). */
const pushTracker = new AlertTracker();
/** Notifications for the browser: the user's rules plus the hints of the waste calendar and the ventilation advice. */
const allAlerts = () => [...alerts.list(), ...waste.hints(), ...ventilation.hints()];
let demoKioskTimer = null;
let demoRadarTimer = null;

/** Cameras as shown in the app (Surveillance Station / demo + the user's overrides), see cameras.js. */
function cameraList() {
  return buildCameraList({ configured: store.effective.cameras, isDemo: store.isDemo, reported: surveillance.cameras, recentMotion: motion.recent });
}

/* ------------------------------------------------------------------ live push */

const wss = new WebSocketServer({ noServer: true });
/** Sends a message to every connected browser. */
const broadcast = (msg) => {
  const data = JSON.stringify(msg);
  for (const c of wss.clients) if (c.readyState === 1) c.send(data);
};

// State changes are collected for 80 ms and sent as one message, so a burst of
// changes (e.g. a scene) causes a single browser update instead of dozens.
let pending = {};
let flushTimer = null;
/** Drops changes that were not pushed yet (they belong to the previous source after a configuration change). */
function dropPendingStates() {
  clearTimeout(flushTimer);
  flushTimer = null;
  pending = {};
}
function queueState(id, entry) {
  pending[id] = entry;
  flushTimer ??= setTimeout(() => {
    broadcast({ t: 'states', states: pending });
    pending = {};
    flushTimer = null;
  }, PUSH_DELAY_MS);
}

/** Connection status of all integrations, sent to the browser on every change. */
const statusPayload = () => ({
  demo: store.isDemo,
  source: source.status(),
  surveillance: store.isDemo ? { enabled: true, connected: true, error: null, cameras: store.effective.cameras.length, demo: true } : surveillance.status(),
  printer: printer.status(),
  spotify: spotify.status(),
});
const broadcastStatus = () => broadcast({ t: 'status', status: statusPayload() });

/** Connects a state source (ioBroker or demo) to the push channel and the motion hub. */
function wireSource(src) {
  src.on('state', (id, entry) => {
    queueState(id, entry);
    motion.onState(id, entry);
    alerts.onState(id, entry);
    ventilation.onState(id);
  });
  src.on('connection', broadcastStatus);
}
wireSource(iobroker);
wireSource(demo);
kiosk.on('state', (id, entry) => {
  queueState(id, entry);
  alerts.onState(id, entry);
  ventilation.onState(id);
});
// live radar frames only go to the browsers that show the radar page (up to four per second and agent)
kiosk.on('radar', (agent, frame) => {
  const data = JSON.stringify({ t: 'radar', agent, frame });
  for (const c of wss.clients) if (c.radarWatch && c.readyState === 1) c.send(data);
});
/** The agents send live frames while at least one browser shows the radar page. */
const updateRadarWatch = () => kiosk.watchRadar([...wss.clients].some((c) => c.radarWatch));
/** Presence limit of the kiosk settings: the simulated agent applies it like a real one. */
const demoRadarLimit = () => store.effective.kiosk?.presenceMaxDistance ?? 0;
/** Demo mode: the simulated wall display sends live frames like a real agent while the radar page is open. */
function syncDemoRadar() {
  const run = kiosk.radarWatched && store.isDemo;
  if (run && !demoRadarTimer) demoRadarTimer = setInterval(() => kiosk.radar('demo', demoRadarFrame(Date.now(), demoRadarLimit())), DEMO_RADAR_MS);
  if (!run && demoRadarTimer) {
    clearInterval(demoRadarTimer);
    demoRadarTimer = null;
  }
}
kiosk.on('radarWatch', syncDemoRadar);
surveillance.on('status', broadcastStatus);
surveillance.on('motion', (e) => motion.trigger(e));
// after a 2-factor login DSM issues a device token; saving it makes the code a one-time matter
surveillance.on('deviceId', (id) => store.setDeviceId(id));
motion.on('motion', (e) => {
  broadcast({ t: 'motion', event: e });
  if (e.popup) kiosk.wake({ reason: 'camera', severity: e.kind === 'people' ? 'alarm' : 'warning', title: e.name });
  if (e.popup || !pushover.cfg.cameraFollowPopup) {
    pushover.notify(e.kind === 'people' ? 'people' : 'motion', {
      title: e.name,
      message: e.kind === 'people' ? `Person erkannt (${e.name})` : `Bewegung erkannt (${e.name})`,
      view: 'cameras',
      image: () => surveillance.snapshot(e.cameraId, 'balanced'),
    });
  }
});
/** Notifications already known (`id:since`): only new ones wake the wall displays. */
let knownAlerts = new Set();
/**
 * After start-up and every saved configuration the rules are evaluated anew (and get a new start
 * time), the calendar and the first ioBroker values arrive: nothing of that is "new" for the user.
 */
let alertWakeAfter = 0;
const broadcastAlerts = () => {
  const list = allAlerts();
  const { keys, fresh } = freshAlerts(knownAlerts, list);
  knownAlerts = keys;
  const settled = Date.now() >= alertWakeAfter;
  if (settled) for (const a of fresh) kiosk.wake({ reason: 'alert', severity: a.severity, title: a.name });
  const { raised, cleared } = pushTracker.update(list);
  if (settled) pushAlerts(raised, cleared);
  broadcast({ t: 'alerts', alerts: list });
};
/** Sends the new notifications (and the all-clear of ended own notifications) as push notifications. */
function pushAlerts(raised, cleared) {
  // own rules can be excluded one by one; waste and ventilation hints have no rule
  const pushable = (a) => Boolean(a.source) || alertRules.find((r) => r.id === a.id)?.push !== false;
  for (const a of raised) if (pushable(a)) pushover.notify(alertEvent(a), { title: a.name, message: a.message, view: a.view });
  for (const a of cleared) {
    if (a.source || !pushable(a) || !pushover.wants(alertEvent(a))) continue;
    pushover.notify('cleared', { title: `Entwarnung: ${a.name}`, message: `Vorbei: ${a.message}`, view: a.view });
  }
}
alerts.on('change', broadcastAlerts);
waste.on('change', () => {
  broadcast({ t: 'waste', waste: waste.data() });
  broadcastAlerts();
});
ventilation.on('change', () => {
  broadcast({ t: 'ventilation', ventilation: ventilation.data() });
  broadcastAlerts();
});
const printProgress = new PrintProgressTimer();
printer.on('data', (data) => {
  broadcast({ t: 'printer', printer: data });
  if (printProgress.due(data, pushover.cfg.printerProgressMinutes) && pushover.wants('printerProgress')) {
    const image = data.webcam?.available ? () => printer.snapshot() : null;
    pushover.notify('printerProgress', { ...printerProgressMessage(data), view: 'printer', image, forceImage: true });
  }
});
printer.on('status', broadcastStatus);
printer.on('job', (job) => {
  const msg = printerMessage(job, printer.data.name);
  if (msg) pushover.notify(msg.event, { title: msg.title, message: msg.message, view: 'printer', image: printer.data.webcam?.available ? () => printer.snapshot() : null });
});
printer.on('popup', (popup) => {
  broadcast({ t: 'printerPopup', popup });
  // the end of a print is a notification; the progress pop-ups while printing are not
  if (popup.reason !== 'interval') kiosk.wake({ reason: 'printer', severity: popup.reason === 'error' ? 'warning' : 'info', title: '3D-Druck' });
});
spotify.on('data', (data) => broadcast({ t: 'spotify', spotify: data }));
spotify.on('status', broadcastStatus);
// Spotify may rotate the refresh token when renewing the access token
spotify.on('token', (refreshToken) => store.setSpotifyAuth({ refreshToken }));

/**
 * (Re)starts all integrations according to the current configuration.
 * Called once at start-up and again whenever the configuration is saved.
 */
function applyConfig() {
  const cfg = store.effective;
  iobroker.stop();
  demo.stop();
  dropPendingStates(); // browsers reload all values after the `config` message below
  motion.prev.clear(); // the new source's first values must not count as "motion started"
  if (cfg.iobroker.mode === 'demo') {
    source = demo;
    demo.start();
    surveillance.configure(null);
  } else {
    source = iobroker;
    iobroker.start(cfg.iobroker);
    surveillance.configure(cfg.surveillance, store.takeOtp());
  }
  // the kiosk datapoints are local, ioBroker does not know them
  source.setIds([...store.stateIds()].filter((id) => !isKioskId(id)));
  // OctoPrint does not depend on ioBroker; it only reconnects when its connection settings changed
  printer.configure(cfg.octoprint, { demo: cfg.iobroker.mode === 'demo', bambu: cfg.bambu });
  spotify.configure(cfg.spotify, { demo: cfg.iobroker.mode === 'demo' });
  // re-evaluate the notifications with the new rules (the demo has all its values right away);
  // alarms that still wait for their acknowledgement are kept
  alertRules = sanitizeAlerts(cfg.alerts);
  pushover.configure(cfg.pushover, { demo: cfg.iobroker.mode === 'demo' });
  alertWakeAfter = Date.now() + ALERT_WAKE_SETTLE_MS;
  alerts.reset();
  alerts.evaluateAll(source.states);
  alerts.evaluateAll(kiosk.states);
  waste.configure(cfg.waste, { demo: cfg.iobroker.mode === 'demo' });
  ventilation.configure();
  // demo mode: a simulated wall display reports its sensors like a real kiosk agent
  clearInterval(demoKioskTimer);
  demoKioskTimer = null;
  if (cfg.iobroker.mode === 'demo') {
    kiosk.report(demoKioskReport(Date.now(), demoRadarLimit()));
    demoKioskTimer = setInterval(() => kiosk.report(demoKioskReport(Date.now(), demoRadarLimit())), 10000);
  } else {
    kiosk.remove('demo');
  }
  syncDemoRadar();
  broadcast({ t: 'config' }); // browsers reload the bootstrap data
}

history.start(function* () {
  yield* source.states.entries();
  yield* kiosk.states.entries();
});

/* ------------------------------------------------------------------ http */

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
  const cam = cameraList().find((c) => c.id === wanted || c.name.toLowerCase() === wanted);
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

registerApiRoutes(app, {
  store,
  getSource: () => source,
  demo,
  history,
  weather,
  validCoords,
  demoForecast,
  discover,
  controlIds,
  buildFixScript,
  cameraList,
  alerts,
  motion,
  printer,
  spotify,
  surveillance,
  kindPopupAllowed,
  statusPayload,
  broadcast,
  demoCoverSvg,
  kiosk,
  waste,
  ventilation,
  allAlerts,
  pushover,
});

// unknown API paths answer with JSON instead of the SPA fallback below
app.use('/api', (_req, res) => res.status(404).json({ error: 'Nicht gefunden' }));

// Frontend: static files with an SPA fallback so that reloading any view works.
// The start page, the service worker and the manifest must always be revalidated (app updates).
const NO_CACHE = /(index\.html|sw\.js|manifest\.webmanifest)$/;
if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR, { maxAge: '1h', setHeaders: (r, f) => NO_CACHE.test(f) && r.setHeader('Cache-Control', 'no-cache') }));
  app.get('*', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
} else {
  app.get('/', (_req, res) => res.send('HomeApp-Server läuft. Frontend nicht gebaut (client/dist fehlt).'));
}

const server = createServer(app, { dataDir: DATA_DIR });
// WebSocket upgrade: same authentication as the REST API, only on the /ws path.
server.on('upgrade', (req, socket, head) => {
  if (!req.url?.startsWith('/ws') || !authorized(req.headers.authorization)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
});
wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.radarWatch = false;
  ws.on('pong', () => (ws.isAlive = true));
  // the only message of the browser: `{t: 'radar', watch}` while it shows the radar page
  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    if (msg?.t !== 'radar') return;
    ws.radarWatch = msg.watch === true;
    updateRadarWatch();
  });
  ws.on('close', () => {
    ws.radarWatch = false;
    updateRadarWatch();
  });
  ws.send(JSON.stringify({ t: 'status', status: statusPayload() }));
});
// Heartbeat: connections that do not answer a ping are dropped, so dead browser tabs do not pile up.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, HEARTBEAT_MS);

// configuration saved in the settings -> restart the integrations
store.on('change', applyConfig);
store.on('dashboard', (dashboard) => broadcast({ t: 'dashboard', dashboard }));
applyConfig();
server.listen(PORT, () => {
  console.log(`HomeApp läuft auf ${httpsEnabled() ? 'https' : 'http'}://…:${PORT} (${store.isDemo ? 'Demo-Modus' : 'ioBroker-Modus'})`);
  if (AUTH_USER || AUTH_PASS) console.log('Zugriffsschutz (Basic Auth) ist aktiv.');
});

// Graceful shutdown (docker stop): persist the history, then exit – at the latest after 2 s.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    history.stop();
    alerts.stop();
    printer.stop();
    spotify.stop();
    waste.stop();
    ventilation.stop();
    kiosk.stop();
    clearInterval(demoKioskTimer);
    clearInterval(demoRadarTimer);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
