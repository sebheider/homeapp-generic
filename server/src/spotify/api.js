/**
 * Talking to Spotify: addresses, errors with German messages and `fetch` with timeout and one retry.
 */
import { list } from './normalize.js';

/** Spotify's accounts service (login, tokens). */
export const ACCOUNTS = 'https://accounts.spotify.com';
/** Base address of the Web API. */
export const API = 'https://api.spotify.com/v1';

const REQUEST_TIMEOUT_MS = 10000;
const RETRY_DELAY_MS = 1000;
export const SEARCH_LIMIT = 10; // maximum of the development mode
const DNS_ERRORS = new Set(['ENOTFOUND', 'EAI_AGAIN', 'EAI_FAIL', 'EAI_NODATA', 'EAI_NONAME']);
/** The connection could not be made: nothing reached Spotify, so the request may be sent again. */
const CONNECT_ERRORS = new Set([...DNS_ERRORS, 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT']);

/** Error of the Web API with a German message; `fatal`: the login is gone, polling stops until it is renewed. */
export class SpotifyError extends Error {
  constructor(status, message, reason = null) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

/** German explanation of an error answer of the Web API. */
export function spotifyMessage(status, reason, message = '') {
  if (reason === 'PREMIUM_REQUIRED') return 'Die Steuerung erfordert Spotify Premium.';
  if (reason === 'NO_ACTIVE_DEVICE') return 'Kein aktives Spotify-Gerät – wähle ein Gerät aus oder starte Spotify auf dem Verstärker.';
  if (status === 401) return 'Spotify-Anmeldung abgelaufen – in den Einstellungen neu verbinden.';
  if (status === 403 && /not registered|developer dashboard/i.test(message)) return 'Dieses Spotify-Konto ist für die App nicht freigegeben – im Spotify-Developer-Dashboard unter „User Management“ eintragen.';
  if (status === 403) return `Spotify erlaubt diese Aktion nicht${message ? ` (${message})` : ''}.`;
  if (status === 404) return reason ? `Nicht gefunden (${reason}).` : 'Gerät oder Inhalt nicht gefunden – ist der Verstärker eingeschaltet?';
  if (status === 429) return 'Zu viele Anfragen an Spotify – bitte kurz warten.';
  if (status >= 500) return 'Spotify ist gerade nicht erreichbar.';
  return message || `Spotify antwortet mit Fehler ${status}.`;
}

/** Error code of a failed `fetch`: Node only says "fetch failed" and keeps the reason in `cause` (several addresses: AggregateError). */
export function networkCode(err) {
  const cause = err?.cause ?? err;
  return String(cause?.code ?? list(cause?.errors).find((e) => e.code)?.code ?? '');
}

/** German explanation of a request to `host` that got no answer (name resolution, connection, certificate, timeout). */
export function networkMessage(err, host) {
  const code = networkCode(err);
  const why = (() => {
    if (err?.name === 'TimeoutError') return `${host} antwortet nicht (Zeitüberschreitung) – hat der Server bzw. Docker-Container Internetzugang?`;
    if (DNS_ERRORS.has(code)) return `${host} lässt sich nicht auflösen (${code}) – DNS des Servers bzw. Docker-Containers prüfen`;
    if (CONNECT_ERRORS.has(code)) return `keine Verbindung zu ${host} (${code}) – hat der Server bzw. Docker-Container Internetzugang?`;
    if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ERR_TLS|ERR_SSL/.test(code)) return `Zertifikat von ${host} nicht akzeptiert (${code}) – stimmt die Uhrzeit des Servers, prüft ein Proxy / eine Firewall HTTPS?`;
    if (code === 'ECONNRESET' || code === 'EPIPE' || code.startsWith('UND_ERR')) return `Verbindung zu ${host} abgebrochen (${code}) – Firewall / Proxy prüfen`;
    const msg = err?.cause?.message || err?.message || 'unbekannter Fehler';
    return `${host}: ${msg}${code && !msg.includes(code) ? ` (${code})` : ''}`;
  })();
  return `Spotify nicht erreichbar: ${why}.`;
}

/**
 * `fetch` with a timeout. A failed connection is tried once more (nothing reached Spotify yet, so even
 * the one-time code of the login stays valid). Without an answer it throws a {@link SpotifyError} that
 * names the reason and keeps the original error as `cause`.
 */
export async function spotifyFetch(fetchImpl, url, init = {}, { retryDelay = RETRY_DELAY_MS } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (err) {
      if (attempt === 0 && CONNECT_ERRORS.has(networkCode(err))) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        continue;
      }
      const e = new SpotifyError(502, networkMessage(err, new URL(url).host));
      e.cause = err;
      throw e;
    }
  }
}
