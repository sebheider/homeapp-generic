import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

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

test('HomeApp binds Home Assistant end-to-end through settings, search and state control', async (t) => {
  const ha = new WebSocketServer({ port: 0 });
  await once(ha, 'listening');
  const reserve = createServer();
  reserve.listen(0, '127.0.0.1');
  await once(reserve, 'listening');
  const port = reserve.address().port;
  await new Promise((resolve) => reserve.close(resolve));
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'homeapp-ha-integration-'));
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: root,
    env: { ...process.env, HTTPS: 'false', PORT: String(port), DATA_DIR: data, APP_USER: '', APP_PASSWORD: '', IOBROKER_HOST: '', DEMO_MODE: '' },
    stdio: 'ignore',
  });
  t.after(async () => {
    child.kill();
    if (child.exitCode === null && child.signalCode === null) await once(child, 'exit');
    await new Promise((resolve) => ha.close(resolve));
    fs.rmSync(data, { recursive: true, force: true });
  });
  const calls = [];
  ha.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'auth_required' }));
    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      calls.push(msg);
      if (msg.type === 'auth') ws.send(JSON.stringify({ type: 'auth_ok' }));
      if (msg.type === 'subscribe_events') ws.send(JSON.stringify({ type: 'result', id: msg.id, success: true, result: null }));
      if (msg.type === 'get_states') ws.send(JSON.stringify({ type: 'result', id: msg.id, success: true, result: [
        { entity_id: 'light.lamp', state: 'on', attributes: { friendly_name: 'Lampe' } },
        { entity_id: 'scene.evening', state: '2026-01-01T00:00:00Z', attributes: { friendly_name: 'Abend' } },
      ] }));
      if (msg.type === 'call_service') ws.send(JSON.stringify({ type: 'result', id: msg.id, success: true, result: null }));
    });
  });
  const base = `http://127.0.0.1:${port}`;
  await waitFor(async () => (await fetch(`${base}/api/health`)).ok);
  const config = (await (await fetch(`${base}/api/config`)).json()).config;
  config.iobroker.mode = 'homeassistant';
  config.homeassistant = { url: `http://127.0.0.1:${ha.address().port}`, token: 'test-token', verifySsl: true };
  config.rooms = [{ id: 'room', name: 'Raum' }];
  config.devices = [{ id: 'lamp', name: 'Lampe', type: 'light', room: 'room', states: { power: 'light.lamp' }, options: {} }];
  config.scenes = [{ id: 'evening', name: 'Abend', actions: [{ state: 'scene.evening', value: true }] }];
  const saved = await fetch(`${base}/api/config`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(config) });
  assert.equal(saved.status, 200);
  const bootstrap = await waitFor(async () => {
    const data = await (await fetch(`${base}/api/bootstrap`)).json();
    return data.status.source.connected && data;
  });
  assert.equal(bootstrap.states['light.lamp'].val, true);
  assert.equal(bootstrap.config.homeassistant.token, undefined);
  const search = await (await fetch(`${base}/api/iobroker/search?q=lampe`)).json();
  assert.ok(search.some((entry) => entry.id === 'light.lamp'));
  const discovery = await (await fetch(`${base}/api/discovery`, { method: 'POST' })).json();
  assert.ok(discovery.devices.some((device) => device.states.power === 'light.lamp'));
  assert.ok(discovery.scenes.some((scene) => scene.actions.some((action) => action.state === 'scene.evening' && action.value === true)));
  const response = await fetch(`${base}/api/state`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'light.lamp', value: false }) });
  assert.equal(response.status, 200);
  assert.ok(calls.some((msg) => msg.type === 'call_service' && msg.service === 'turn_off' && msg.service_data.entity_id === 'light.lamp'));
  const sceneResponse = await fetch(`${base}/api/state`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'scene.evening', value: true }) });
  assert.equal(sceneResponse.status, 200);
  assert.ok(calls.some((msg) => msg.type === 'call_service' && msg.domain === 'scene' && msg.service === 'turn_on' && msg.service_data.entity_id === 'scene.evening'));
});
