/**
 * The `spotify` section of the configuration.
 */
import { clampNumber } from '../util/number.js';
import { trimText } from '../util/text.js';

/** Cleans the `spotify` section of the configuration. `refreshToken` and `account` are written by the login only. */
export function sanitizeSpotify(o = {}) {
  const s = o && typeof o === 'object' ? o : {};
  return {
    enabled: Boolean(s.enabled),
    clientId: trimText(s.clientId, 100).replace(/\s+/g, ''),
    refreshToken: trimText(s.refreshToken, 2000),
    account: trimText(s.account, 100),
    device: trimText(s.device, 100),
    onlyDevice: s.onlyDevice !== false,
    dashboard: s.dashboard !== false,
    pauseMinutes: clampNumber(s.pauseMinutes, 0, 120, 5),
    pollSeconds: clampNumber(s.pollSeconds, 2, 30, 3),
  };
}
