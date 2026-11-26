/**
 * Fan-out of the notifications (own alert rules, waste and ventilation hints) to the browsers, to the
 * wall displays (new notifications wake the screens) and to the phones (Pushover).
 */
import { freshAlerts } from '../kiosk.js';
import { alertEvent } from '../pushover.js';

const ALERT_WAKE_SETTLE_MS = 60 * 1000; // notifications do not wake the wall displays this long after (re)configuring

/**
 * @param {ReturnType<import('./context.js').createContext>} ctx
 * @param {(msg: object) => void} broadcast sends a message to every browser
 */
export function createAlertFanout(ctx, broadcast) {
  const { kiosk, pushover, pushTracker } = ctx;
  /** Notifications already known (`id:since`): only new ones wake the wall displays. */
  let knownAlerts = new Set();
  /**
   * After start-up and every saved configuration the rules are evaluated anew (and get a new start
   * time), the calendar and the first ioBroker values arrive: nothing of that is "new" for the user.
   */
  let alertWakeAfter = 0;

  /** Sends the current notifications to the browsers; new ones wake the wall displays and are pushed. */
  const broadcastAlerts = () => {
    const list = ctx.allAlerts();
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
    const pushable = (a) => Boolean(a.source) || ctx.alertRules.find((r) => r.id === a.id)?.push !== false;
    for (const a of raised) if (pushable(a)) pushover.notify(alertEvent(a), { title: a.name, message: a.message, view: a.view });
    for (const a of cleared) {
      if (a.source || !pushable(a) || !pushover.wants(alertEvent(a))) continue;
      pushover.notify('cleared', { title: `Entwarnung: ${a.name}`, message: `Vorbei: ${a.message}`, view: a.view });
    }
  }

  return {
    broadcastAlerts,
    /** The configuration was (re)applied: for a while nothing wakes the wall displays or is pushed as new. */
    settle() {
      alertWakeAfter = Date.now() + ALERT_WAKE_SETTLE_MS;
    },
  };
}
