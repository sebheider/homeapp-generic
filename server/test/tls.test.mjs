import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { WebSocket, WebSocketServer } from 'ws';
import net from 'node:net';
import { certPaths, createServer, httpsEnabled, httpsLocation, loadTlsOptions, redirectPlainHttp } from '../src/tls.js';

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'homeapp-tls-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('httpsEnabled: defaults and explicit switches', () => {
  assert.equal(httpsEnabled({}), true);
  for (const HTTPS of ['', 'true', '1']) assert.equal(httpsEnabled({ HTTPS }), true);
  for (const HTTPS of ['false', '0', 'no', 'off', 'FALSE', 'NO', 'OFF']) {
    assert.equal(httpsEnabled({ HTTPS }), false);
  }
  assert.equal(httpsEnabled(), httpsEnabled(process.env));
});

test('certPaths: defaults, overrides and empty values', () => {
  const defaults = { cert: path.join('/data', 'certs', 'cert.pem'), key: path.join('/data', 'certs', 'key.pem') };
  assert.deepEqual(certPaths({}, '/data'), defaults);
  assert.deepEqual(certPaths({ TLS_CERT: '', TLS_KEY: '' }, '/data'), defaults);
  assert.deepEqual(certPaths({ TLS_CERT: '/custom/cert', TLS_KEY: '/custom/key' }, '/data'),
    { cert: '/custom/cert', key: '/custom/key' });
  assert.deepEqual(certPaths({ TLS_CERT: '/custom/cert' }, '/data'), { ...defaults, cert: '/custom/cert' });
});

for (const existing of [null, 'cert', 'key', 'both']) {
  test(`loadTlsOptions: existing files = ${existing}`, (t) => {
    const dir = tempDir(t);
    const paths = { cert: path.join(dir, 'certificates', 'cert.pem'), key: path.join(dir, 'keys', 'key.pem') };
    for (const name of ['cert', 'key']) {
      if (existing === name || existing === 'both') {
        fs.mkdirSync(path.dirname(paths[name]), { recursive: true });
        fs.writeFileSync(paths[name], name);
      }
    }
    let calls = 0;
    const options = loadTlsOptions(paths, { generate: (received) => {
      calls++;
      assert.deepEqual(received, paths);
      for (const name of ['cert', 'key']) {
        assert.equal(fs.statSync(path.dirname(paths[name])).isDirectory(), true);
        fs.writeFileSync(paths[name], name);
      }
    } });
    assert.equal(calls, existing === 'both' ? 0 : 1);
    assert.deepEqual(options, { cert: Buffer.from('cert'), key: Buffer.from('key') });
  });
}

test('loadTlsOptions: certificate failures have a German explanation and preserve the cause', (t) => {
  const paths = certPaths({}, tempDir(t));
  const cause = new Error('generation failed');
  assert.throws(() => loadTlsOptions(paths, { generate: () => { throw cause; } }), (error) => {
    assert.match(error.message, /TLS-Zertifikat.*Dateipfade.*Zugriffsrechte.*OpenSSL/);
    assert.equal(error.cause, cause);
    return true;
  });
  assert.throws(() => loadTlsOptions(paths, { generate: () => {} }), /TLS-Zertifikat/);
});

test('createServer: HTTPS=false creates HTTP without touching certificate files', (t) => {
  const dir = tempDir(t);
  const server = createServer((_req, res) => res.end(), { env: { HTTPS: 'false' }, dataDir: dir });
  assert.ok(server instanceof http.Server);
  assert.ok(!(server instanceof https.Server));
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('createServer: real HTTPS health endpoint and WSS upgrade', { timeout: 15000 }, async (t) => {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' });
  } catch {
    return t.skip('OpenSSL ist nicht verfügbar');
  }
  const dir = tempDir(t);
  const server = createServer((req, res) => {
    res.writeHead(req.url === '/api/health' ? 200 : 404);
    res.end('ok');
  }, { env: {}, dataDir: dir });
  assert.ok(server instanceof https.Server);
  const wss = new WebSocketServer({ noServer: true });
  t.after(async () => {
    for (const client of wss.clients) client.terminate();
    await new Promise((resolve) => wss.close(resolve));
    await new Promise((resolve) => server.close(resolve));
  });
  server.on('upgrade', (req, socket, head) => {
    if (!req.url?.startsWith('/ws')) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
  });
  wss.on('connection', (ws) => ws.send('connected'));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  const status = await new Promise((resolve, reject) => {
    https.get(`https://127.0.0.1:${port}/api/health`, { rejectUnauthorized: false }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    }).on('error', reject);
  });
  assert.equal(status, 200);
  const ws = new WebSocket(`wss://127.0.0.1:${port}/ws`, { rejectUnauthorized: false });
  t.after(() => ws.terminate());
  const [message] = await once(ws, 'message');
  assert.equal(message.toString(), 'connected');
  ws.close();
  await once(ws, 'close');

  // Reuse the generated certificate on the next startup.
  const second = createServer((_req, res) => res.end(), { env: { HTTPS: '' }, dataDir: dir });
  assert.ok(second instanceof https.Server);
});

test('httpsLocation: same host and port with https, only for valid requests', () => {
  assert.equal(httpsLocation('GET /settings?tab=spotify HTTP/1.1\r\nHost: 192.168.178.5:8095\r\nAccept: */*'), 'https://192.168.178.5:8095/settings?tab=spotify');
  assert.equal(httpsLocation('POST /api/webhook/motion/1?token=x HTTP/1.0\r\nhost: homeapp.local'), 'https://homeapp.local/api/webhook/motion/1?token=x');
  assert.equal(httpsLocation('GET / HTTP/1.1\r\nHost: [::1]:8095'), 'https://[::1]:8095/');
  assert.equal(httpsLocation('GET http://other/x HTTP/1.1\r\nHost: a:1'), 'https://a:1/', 'absolute form: start page');
  assert.equal(httpsLocation('GET / HTTP/1.1'), null, 'no Host header');
  for (const host of ['evil.com/path', 'a b', 'x"y', 'a:b:c', '']) assert.equal(httpsLocation(`GET / HTTP/1.1\r\nHost: ${host}`), null, host);
  // a header line can not smuggle anything into the redirect: lines are split before parsing
  assert.equal(httpsLocation('GET / HTTP/1.1\r\nHost: x\r\nSet-Cookie: y'), 'https://x/');
  assert.equal(httpsLocation('hello'), null);
  assert.equal(httpsLocation('GET / HTTP/2.0\r\nHost: a'), null);
});

/** Sends raw bytes over TCP and returns everything the server answers until it closes. */
async function rawRequest(port, text) {
  const socket = net.connect(port, '127.0.0.1');
  await once(socket, 'connect');
  if (text) socket.write(text);
  const chunks = [];
  socket.on('data', (c) => chunks.push(c));
  await once(socket, 'close');
  return Buffer.concat(chunks).toString('latin1');
}

test('plain HTTP on the HTTPS port is redirected to https://, HTTPS and WSS keep working', { timeout: 15000 }, async (t) => {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' });
  } catch {
    return t.skip('OpenSSL ist nicht verfügbar');
  }
  const dir = tempDir(t);
  const server = createServer((req, res) => res.end(`secure ${req.url}`), { env: {}, dataDir: dir });
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => wss.handleUpgrade(req, socket, head, (ws) => ws.send('connected')));
  t.after(async () => {
    for (const client of wss.clients) client.terminate();
    await new Promise((resolve) => wss.close(resolve));
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;

  // a browser opening http://…
  const res = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/settings?tab=spotify#x`, (r) => {
      let body = '';
      r.on('data', (c) => (body += c));
      r.on('end', () => resolve({ status: r.statusCode, location: r.headers.location, cache: r.headers['cache-control'], body }));
    }).on('error', reject);
  });
  assert.equal(res.status, 307);
  assert.equal(res.location, `https://127.0.0.1:${port}/settings?tab=spotify`);
  assert.equal(res.cache, 'no-store');
  assert.match(res.body, /HTTPS/);

  const head = await rawRequest(port, `HEAD / HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\n`);
  assert.match(head, /^HTTP\/1\.1 307/);
  assert.ok(head.endsWith('\r\n\r\n'), 'no body for HEAD');
  assert.match(await rawRequest(port, 'GET / HTTP/1.1\r\nHost: evil.com/x\r\n\r\n'), /^HTTP\/1\.1 400/);
  assert.match(await rawRequest(port, 'hello\r\n\r\n'), /^HTTP\/1\.1 400/);
  // a request head arriving in several pieces
  const split = net.connect(port, '127.0.0.1');
  await once(split, 'connect');
  const answer = [];
  split.on('data', (c) => answer.push(c));
  split.write('GET /a HTTP/1.1\r\nHo');
  await new Promise((r) => setTimeout(r, 50));
  split.write(`st: 127.0.0.1:${port}\r\n\r\n`);
  await once(split, 'close');
  assert.match(Buffer.concat(answer).toString(), new RegExp(`Location: https://127\\.0\\.0\\.1:${port}/a`));

  // HTTPS and WSS on the same port as before
  const secure = await new Promise((resolve, reject) => {
    https.get(`https://127.0.0.1:${port}/api/health`, { rejectUnauthorized: false }, (r) => {
      let body = '';
      r.on('data', (c) => (body += c));
      r.on('end', () => resolve(body));
    }).on('error', reject);
  });
  assert.equal(secure, 'secure /api/health');
  const ws = new WebSocket(`wss://127.0.0.1:${port}/ws`, { rejectUnauthorized: false });
  t.after(() => ws.terminate());
  const [message] = await once(ws, 'message');
  assert.equal(message.toString(), 'connected');
});

test('redirectPlainHttp: connections that send nothing are closed', { timeout: 10000 }, async (t) => {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' });
  } catch {
    return t.skip('OpenSSL ist nicht verfügbar');
  }
  const tlsOptions = loadTlsOptions(certPaths({}, tempDir(t)));
  const server = redirectPlainHttp(https.createServer(tlsOptions, (_req, res) => res.end()), { timeout: 200 });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const started = Date.now();
  assert.equal(await rawRequest(server.address().port, ''), '');
  assert.ok(Date.now() - started < 5000);
  // a server whose connection handling looks unexpected is left alone
  const odd = https.createServer(tlsOptions);
  odd.on('connection', () => {});
  assert.equal(redirectPlainHttp(odd).listenerCount('connection'), 2);
});
