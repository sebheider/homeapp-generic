/**
 * Access protection helpers.
 *
 * All secret comparisons hash both sides first, so that `timingSafeEqual` always compares
 * buffers of the same length and the time taken does not reveal anything about the secret.
 */
import crypto from 'node:crypto';

const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();

/** Constant-time string comparison (for passwords and tokens). */
export const safeEqual = (a, b) => crypto.timingSafeEqual(digest(a), digest(b));

/**
 * Creates the HTTP Basic Auth check for the configured credentials.
 * Without user and password, access is not restricted at all.
 * @param {string} user expected user name (APP_USER)
 * @param {string} pass expected password (APP_PASSWORD)
 * @returns {(header: string|undefined) => boolean} checks an `Authorization` header
 */
export function basicAuth(user, pass) {
  if (!user && !pass) return () => true;
  return (header) => {
    const [scheme, token] = String(header || '').split(' ');
    if (scheme !== 'Basic' || !token) return false;
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const i = decoded.indexOf(':');
    // both comparisons always run, so a wrong user name takes as long as a wrong password
    const userOk = safeEqual(decoded.slice(0, i), user);
    const passOk = safeEqual(decoded.slice(i + 1), pass);
    return userOk && passOk;
  };
}
