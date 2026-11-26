/**
 * Applying the configuration: every integration is (re)started according to the current configuration.
 */
import { sanitizeAlerts } from '../alerts.js';
import { isKioskId } from '../kiosk.js';

/**
 * (Re)starts all integrations according to the current configuration.
 * Called once at start-up and again whenever the configuration is saved.
 * @param {ReturnType<import('./context.js').createContext>} ctx
 * @param {{live: ReturnType<import('./live.js').createLivePush>, alertFanout: ReturnType<import('./notifications.js').createAlertFanout>,
 *   demoKiosk: import('./demo-kiosk.js').DemoKiosk}} deps
 */
export function applyConfig(ctx, { live, alertFanout, demoKiosk }) {
  const { store, iobroker, homeassistant, demo, surveillance, motion, printer, spotify, pushover, alerts, kiosk, waste, ventilation } = ctx;
  const cfg = store.effective;
  iobroker.stop();
  homeassistant.stop();
  demo.stop();
  live.dropPendingStates(); // browsers reload all values after the `config` message below
  motion.prev.clear(); // the new source's first values must not count as "motion started"
  if (cfg.iobroker.mode === 'demo') {
    ctx.source = demo;
    demo.start({ mower: cfg.modules.mower });
    surveillance.configure(null);
  } else if (cfg.iobroker.mode === 'homeassistant') {
    ctx.source = homeassistant;
    homeassistant.start(cfg.homeassistant);
    surveillance.configure(cfg.surveillance, store.takeOtp());
  } else {
    ctx.source = iobroker;
    iobroker.start(cfg.iobroker);
    surveillance.configure(cfg.surveillance, store.takeOtp());
  }
  // the kiosk datapoints are local, ioBroker does not know them
  ctx.source.setIds([...store.stateIds()].filter((id) => !isKioskId(id)));
  // OctoPrint does not depend on ioBroker; it only reconnects when its connection settings changed
  printer.configure(cfg.modules.printer ? cfg.octoprint : { ...cfg.octoprint, enabled: false }, { demo: cfg.modules.printer && store.isDemo, bambu: cfg.bambu });
  spotify.configure(cfg.modules.spotify ? cfg.spotify : { ...cfg.spotify, enabled: false }, { demo: cfg.modules.spotify && store.isDemo });
  // re-evaluate the notifications with the new rules (the demo has all its values right away);
  // alarms that still wait for their acknowledgement are kept
  ctx.alertRules = sanitizeAlerts(cfg.alerts);
  pushover.configure(cfg.pushover, { demo: cfg.iobroker.mode === 'demo' });
  alertFanout.settle();
  alerts.reset();
  alerts.evaluateAll(ctx.source.states);
  alerts.evaluateAll(kiosk.states);
  waste.configure(cfg.waste, { demo: cfg.iobroker.mode === 'demo' });
  ventilation.configure();
  // demo mode: a simulated wall display reports its sensors like a real kiosk agent
  demoKiosk.configure(cfg.iobroker.mode === 'demo');
  live.broadcast({ t: 'config' }); // browsers reload the bootstrap data
}
