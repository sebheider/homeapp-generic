import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { registerApiRoutes } from '../src/api.js';

test('disabled modules reject direct API requests', async (t) => {
  const app = express();
  registerApiRoutes(app, {
    store: { effective: { modules: { weather: false, printer: false, spotify: false } } },
    getSource: () => ({ states: new Map() }),
    motion: { recent: [] }, alerts: { list: () => [] },
    printer: { data: null }, spotify: { current: () => null },
    statusPayload: () => ({}), cameraList: () => [],
  });
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  for (const id of ['weather', 'printer', 'spotify']) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/${id}`);
    assert.equal(response.status, 404);
    assert.match((await response.json()).error, /deaktiviert/);
  }
});

test('API routes use the active source and only accept configured state ids', async (t) => {
  const writes = [];
  const source = {
    states: new Map([['light.living', { val: true, ts: 1, ack: true }]]),
    set: async (...args) => writes.push(args),
  };
  const app = express();
  app.use(express.json());
  registerApiRoutes(app, {
    store: {
      publicConfig: () => ({ appName: 'Test' }),
      stateIds: () => new Set(['light.living']),
    },
    getSource: () => source,
    motion: { recent: [] },
    alerts: { list: () => [] },
    printer: { data: null },
    spotify: { current: () => null },
    statusPayload: () => ({ connected: true }),
    cameraList: () => [],
  });
  const server = app.listen(0);
  t.after(() => new Promise((resolve, reject) => {
    server.close((err) => err ? reject(err) : resolve());
  }));
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const bootstrap = await fetch(`${base}/api/bootstrap`);
  assert.equal(bootstrap.status, 200);
  assert.deepEqual((await bootstrap.json()).states, { 'light.living': { val: true, ts: 1, ack: true } });

  const invalid = await fetch(`${base}/api/state`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'system.unknown', value: true }),
  });
  assert.equal(invalid.status, 400);
  assert.deepEqual(writes, []);

  const valid = await fetch(`${base}/api/state`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'light.living', value: false }),
  });
  assert.equal(valid.status, 200);
  assert.deepEqual(writes, [['light.living', false]]);
});

test('Pushover test message uses the stored keys when the settings page sends none', async (t) => {
  const sent = [];
  const pushover = { send: async (msg, cfg) => sent.push([msg.title, cfg.user, cfg.token, cfg.device]), status: () => ({ active: true }) };
  const app = express();
  app.use(express.json());
  registerApiRoutes(app, {
    store: { raw: { pushover: { user: 'STORED_USER', token: 'STORED_TOKEN' } }, stateIds: () => new Set() },
    getSource: () => ({ states: new Map() }),
    motion: { recent: [] },
    alerts: { list: () => [] },
    printer: { data: null },
    spotify: { current: () => null },
    statusPayload: () => ({}),
    cameraList: () => [],
    pushover,
  });
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  const post = (body) => fetch(`http://127.0.0.1:${server.address().port}/api/pushover/test`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  assert.equal((await post({ user: '', token: '', device: 'phone' })).status, 200);
  assert.equal((await post({ user: 'NEW', token: '' })).status, 200);
  assert.deepEqual(sent, [['HomeApp', 'STORED_USER', 'STORED_TOKEN', 'phone'], ['HomeApp', 'NEW', 'STORED_TOKEN', '']]);
});
