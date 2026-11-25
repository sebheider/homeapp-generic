import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/** First byte of a TLS handshake record: every HTTPS connection starts with it. */
const TLS_HANDSHAKE = 0x16;
/** A plain HTTP request head longer than this is not waited for. */
const MAX_REQUEST_HEAD = 8192;
const HOST = /^(?:[A-Za-z0-9.-]+|\[[0-9A-Fa-f:.]+\])(?::\d{1,5})?$/;

export function httpsEnabled(env = process.env) {
  return !['0', 'false', 'no', 'off'].includes(String(env.HTTPS ?? '').toLowerCase());
}

export function certPaths(env, dataDir) {
  return {
    cert: env.TLS_CERT || path.join(dataDir, 'certs', 'cert.pem'),
    key: env.TLS_KEY || path.join(dataDir, 'certs', 'key.pem'),
  };
}

function generateCertificate({ cert, key }) {
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '3650',
    '-subj', '/CN=homeapp',
    '-addext', 'subjectAltName=DNS:homeapp,DNS:localhost,IP:127.0.0.1',
    '-out', cert, '-keyout', key,
  ], { stdio: 'ignore' });
}

export function loadTlsOptions({ cert, key }, { generate = generateCertificate } = {}) {
  try {
    if (!fs.existsSync(cert) || !fs.existsSync(key)) {
      fs.mkdirSync(path.dirname(cert), { recursive: true });
      fs.mkdirSync(path.dirname(key), { recursive: true });
      generate({ cert, key });
    }
    return { cert: fs.readFileSync(cert), key: fs.readFileSync(key) };
  } catch (cause) {
    throw new Error(
      `TLS-Zertifikat konnte nicht geladen oder erzeugt werden (${cert}, ${key}). Bitte Dateipfade, Zugriffsrechte und die OpenSSL-Installation prüfen.`,
      { cause },
    );
  }
}

/**
 * Target of the redirect for a plain HTTP request head: the same host and port with https://.
 * Null if the request is no valid HTTP/1.x request or has no usable Host header.
 */
export function httpsLocation(head) {
  const [requestLine, ...lines] = String(head).split('\r\n');
  const m = /^[A-Z]+ (\S+) HTTP\/1\.[01]$/.exec(requestLine);
  if (!m) return null;
  const host = lines.find((l) => /^host:/i.test(l))?.slice(5).trim();
  if (!host || !HOST.test(host)) return null;
  const target = m[1].startsWith('/') && !/[\x00-\x1f\x7f]/.test(m[1]) ? m[1] : '/';
  return `https://${host}${target}`;
}

/** Answers a plain HTTP request with a temporary redirect to https:// (400 if no target can be built) and closes. */
function answerPlainHttp(socket, head) {
  const location = httpsLocation(head);
  const body = location ? `Bitte HTTPS verwenden: ${location}\n` : 'Bitte HTTPS verwenden.\n';
  const isHead = head.startsWith('HEAD ');
  socket.end([
    location ? 'HTTP/1.1 307 Temporary Redirect' : 'HTTP/1.1 400 Bad Request',
    ...(location ? [`Location: ${location}`] : []),
    'Content-Type: text/plain; charset=utf-8',
    `Content-Length: ${Buffer.byteLength(body)}`,
    'Cache-Control: no-store',
    'Connection: close',
    '',
    isHead ? '' : body,
  ].join('\r\n'));
}

/**
 * Lets the HTTPS port also answer plain HTTP: `http://<ip>:8095/…` is redirected to
 * `https://<ip>:8095/…` instead of failing with a connection error. The first byte of each new
 * connection decides – a TLS handshake goes to the HTTPS server as before, anything else gets the
 * redirect (307, not cached, so switching to HTTPS=false later does not leave stale redirects).
 * Connections that send nothing are closed after `timeout` ms.
 */
export function redirectPlainHttp(server, { timeout = 10000 } = {}) {
  const listeners = server.listeners('connection');
  // the TLS server handles new sockets with exactly one listener; anything else: leave it alone
  if (listeners.length !== 1) return server;
  const [tlsListener] = listeners;
  server.removeListener('connection', tlsListener);
  server.on('connection', (socket) => {
    const fail = () => socket.destroy();
    socket.on('error', fail);
    socket.setTimeout(timeout, fail);
    let head = Buffer.alloc(0);
    const onData = (chunk) => {
      if (!head.length && chunk[0] === TLS_HANDSHAKE) {
        // hand the connection to TLS with the bytes read so far put back
        socket.removeListener('data', onData);
        socket.pause();
        socket.unshift(chunk);
        socket.setTimeout(0);
        tlsListener.call(server, socket);
        return;
      }
      head = Buffer.concat([head, chunk]);
      const end = head.indexOf('\r\n\r\n');
      if (end >= 0 || head.length > MAX_REQUEST_HEAD) {
        socket.removeListener('data', onData);
        answerPlainHttp(socket, head.subarray(0, end >= 0 ? end : head.length).toString('latin1'));
      }
    };
    socket.on('data', onData);
  });
  return server;
}

export function createServer(app, { env = process.env, dataDir }) {
  if (!httpsEnabled(env)) return http.createServer(app);
  return redirectPlainHttp(https.createServer(loadTlsOptions(certPaths(env, dataDir)), app));
}
