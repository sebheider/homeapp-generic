/**
 * Event wiring: connects the integrations with each other, with the live push to the browsers, with the
 * wall displays (wake-ups) and with the push notifications to phones.
 */
import { PrintProgressTimer, printerMessage, printerProgressMessage } from '../pushover.js';

/**
 * Registers every event listener between the integrations (called once at start-up).
 * @param {ReturnType<import('./context.js').createContext>} ctx
 * @param {{live: ReturnType<import('./live.js').createLivePush>, alertFanout: ReturnType<import('./notifications.js').createAlertFanout>,
 *   demoKiosk: import('./demo-kiosk.js').DemoKiosk}} deps
 */
export function wireEvents(ctx, { live, alertFanout, demoKiosk }) {
  const { store, iobroker, homeassistant, demo, kiosk, surveillance, motion, alerts, waste, ventilation, printer, spotify, pushover } = ctx;
  const { broadcast, queueState } = live;
  const { broadcastAlerts } = alertFanout;
  const broadcastStatus = () => broadcast({ t: 'status', status: ctx.statusPayload() });

  /** Connects a state source (ioBroker, Home Assistant or demo) to the push channel and the motion hub. */
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
  wireSource(homeassistant);
  wireSource(demo);
  kiosk.on('state', (id, entry) => {
    queueState(id, entry);
    alerts.onState(id, entry);
    ventilation.onState(id);
  });
  kiosk.on('radar', live.sendRadar);
  kiosk.on('radarWatch', () => demoKiosk.syncRadar());

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
}
