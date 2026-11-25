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

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * True for requests a browser sends on behalf of another site or of a sandboxed page (opaque origin
 * "null", e.g. the page of an external module). Such requests must not change anything – browsers would
 * otherwise attach the saved Basic Auth credentials.
 */
export const foreignRequest = (headers) => headers.origin === 'null' || headers['sec-fetch-site'] === 'cross-site';

/** Express middleware: rejects changing requests ({@link foreignRequest}); reading stays possible. */
export function blockForeignWrites(req, res, next) {
  if (SAFE_METHODS.has(req.method) || !foreignRequest(req.headers)) return next();
  res.status(403).json({ error: 'Anfrage von einer fremden oder abgeschotteten Seite abgelehnt' });
}
