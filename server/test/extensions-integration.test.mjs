import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { zip } from './zip-helper.mjs';

const serverRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const examples = path.join(serverRoot, '..', 'examples', 'modules');

async function freePort() {
  const reserve = createServer();
  reserve.listen(0, '127.0.0.1');
  await once(reserve, 'listening');
  const { port } = reserve.address();
  await new Promise((resolve) => reserve.close(resolve));
  return port;
}

async function waitFor(fn, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      if (error.cause?.code !== 'ECONNREFUSED') throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Zeitüberschreitung beim Warten auf HomeApp');
}

/** Starts the real server on a data folder; resolves with its base URL once it answers. */
async function startApp(t, data) {
  const port = await freePort();
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: serverRoot,
    env: { ...process.env, HTTPS: 'false', PORT: String(port), DATA_DIR: data, MODULES_DIR: '', APP_USER: '', APP_PASSWORD: '', IOBROKER_HOST: '', DEMO_MODE: '' },
    stdio: 'ignore',
  });
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill();
    await once(child, 'exit');
  };
  t.after(stop);
  const base = `http://127.0.0.1:${port}`;
  await waitFor(async () => (await fetch(`${base}/api/health`)).ok);
  return { base, port, stop };
}

const json = (method, body) => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('external module end-to-end: install, enable and map in the settings, write, restart, remove', async (t) => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'homeapp-ext-e2e-'));
  t.after(() => fs.rmSync(data, { recursive: true, force: true }));
  let app = await startApp(t, data);

  // install the card-only example as a plain module.json
  const pool = fs.readFileSync(path.join(examples, 'pool', 'module.json'));
  const installed = await fetch(`${app.base}/api/extensions`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: pool });
  assert.equal(installed.status, 200);
  assert.ok(fs.existsSync(path.join(data, 'modules', 'pool', 'module.json')));

  // the editor shows the new module switched off with its defaults
  let { config } = await (await fetch(`${app.base}/api/config`)).json();
  assert.deepEqual(config.extensions.pool, { enabled: false, settings: { water: '', pump: '', target: '', backwash: '' } });
  // not enabled yet: its datapoints are unknown to the app
  assert.equal((await fetch(`${app.base}/api/state`, json('POST', { id: 'pool.pump', value: true }))).status, 400);

  config.extensions.pool = { enabled: true, settings: { water: 'pool.water', pump: 'pool.pump', target: '', backwash: '', bogus: 'x' } };
  assert.equal((await fetch(`${app.base}/api/config`, json('PUT', config))).status, 200);

  const boot = await (await fetch(`${app.base}/api/bootstrap`)).json();
  assert.deepEqual(boot.extensions.map((m) => m.id), ['pool']);
  assert.deepEqual(boot.config.extensions.pool.settings, { water: 'pool.water', pump: 'pool.pump', target: '', backwash: '' });
  // mapped datapoints of an enabled module may be written (demo source)
  assert.equal((await fetch(`${app.base}/api/state`, json('POST', { id: 'pool.pump', value: true }))).status, 200);
  // …but not from a sandboxed page, and the WebSocket refuses it too
  assert.equal((await fetch(`${app.base}/api/state`, { ...json('POST', { id: 'pool.pump', value: false }), headers: { 'content-type': 'application/json', origin: 'null' } })).status, 403);
  const ws = new WebSocket(`ws://127.0.0.1:${app.port}/ws`, { headers: { origin: 'null' } });
  const [err] = await once(ws, 'error');
  assert.match(err.message, /401/);

  // the files of a card-only module do not exist; the SPA fallback does not answer for them either
  assert.equal((await fetch(`${app.base}/extensions/pool/index.html`)).status, 404);

  // settings and enabled state survive a restart
  await app.stop();
  app = await startApp(t, data);
  ({ config } = await (await fetch(`${app.base}/api/config`)).json());
  assert.equal(config.extensions.pool.enabled, true);
  assert.equal(config.extensions.pool.settings.water, 'pool.water');

  // an HTML module as ZIP (zipped together with its folder)
  const wallbox = path.join(examples, 'wallbox');
  const pkg = zip(Object.fromEntries(fs.readdirSync(wallbox).map((f) => [`wallbox/${f}`, fs.readFileSync(path.join(wallbox, f))])));
  assert.equal((await fetch(`${app.base}/api/extensions`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: pkg })).status, 200);
  const page = await fetch(`${app.base}/extensions/wallbox/index.html`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /sandbox allow-scripts/);

  // removing drops files, stored settings and the write permission
  assert.equal((await fetch(`${app.base}/api/extensions/pool`, { method: 'DELETE' })).status, 200);
  assert.equal(fs.existsSync(path.join(data, 'modules', 'pool')), false);
  ({ config } = await (await fetch(`${app.base}/api/config`)).json());
  assert.equal(config.extensions.pool, undefined);
  assert.equal(JSON.parse(fs.readFileSync(path.join(data, 'config.json'), 'utf8')).extensions.pool, undefined);
  assert.equal((await fetch(`${app.base}/api/state`, json('POST', { id: 'pool.pump', value: true }))).status, 400);
});
