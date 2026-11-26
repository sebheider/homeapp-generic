/** Notifications the user hid or still has to acknowledge. */
import type { ActiveAlert } from '../types';

export const DISMISSED_KEY = 'dismissedAlerts';
/** Hidden notifications from localStorage (tolerates missing / broken data). */
export const loadDismissed = (): Record<string, number> => {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) || '{}') ?? {};
  } catch {
    return {};
  }
};

/** True if the notification still has to be acknowledged ("quittiert"). */
export const needsAck = (a: ActiveAlert) => Boolean(a.requireAck && !a.acked);

/** True if the user hid exactly this occurrence of the notification (alerts waiting for acknowledgement can not be hidden). */
export const isDismissed = (a: ActiveAlert, dismissed: Record<string, number>) => !needsAck(a) && dismissed[a.id] === a.since;
