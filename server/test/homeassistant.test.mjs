import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import { HomeAssistantSource, homeAssistantCommand, homeAssistantValue } from '../src/homeassistant.js';

test('Home Assistant normalisiert Werte und übersetzt unterstützte Befehle', () => {
  assert.equal(homeAssistantValue('on'), true);
  assert.equal(homeAssistantValue('unavailable'), null);
  assert.equal(homeAssistantValue('12.5'), 12.5);
  assert.deepEqual(homeAssistantCommand('light.lamp', true), { domain: 'light', service: 'turn_on', service_data: { entity_id: 'light.lamp' } });
  assert.deepEqual(homeAssistantCommand('climate.room#temperature', 22), { domain: 'climate', service: 'set_temperature', service_data: { entity_id: 'climate.room', temperature: 22 } });
  assert.deepEqual(homeAssistantCommand('climate.room', 'heat'), { domain: 'climate', service: 'set_hvac_mode', service_data: { entity_id: 'climate.room', hvac_mode: 'heat' } });
  assert.deepEqual(homeAssistantCommand('light.lamp#rgb_color', '#ff8040'), { domain: 'light', service: 'turn_on', service_data: { entity_id: 'light.lamp', rgb_color: [255, 128, 64] } });
  assert.deepEqual(homeAssistantCommand('scene.evening', true), { domain: 'scene', service: 'turn_on', service_data: { entity_id: 'scene.evening' } });
  assert.deepEqual(homeAssistantCommand('button.restart', true), { domain: 'button', service: 'press', service_data: { entity_id: 'button.restart' } });
  assert.deepEqual(homeAssistantCommand('input_button.restart', true), { domain: 'input_button', service: 'press', service_data: { entity_id: 'input_button.restart' } });
  assert.throws(() => homeAssistantCommand('scene.evening', false), /true/);
  assert.throws(() => homeAssistantCommand('cover.blind#current_position', 101), /Bereich/);
  assert.throws(() => homeAssistantCommand('sensor.temp', 2), /nicht unterstützt/);
});

test('WebSocket authentifiziert, liest Entities, überträgt Änderungen und führt Service-Aufrufe aus', async (t) => {
  const server = new WebSocketServer({ port: 0 });
  await once(server, 'listening');
  const source = new HomeAssistantSource();
  t.after(() => { source.stop(); server.close(); });
  const calls = [];
  let peer;
  server.on('connection', (ws, req) => {
    peer = ws;
    assert.equal(req.url, '/api/websocket');
    ws.send(JSON.stringify({ type: 'auth_required' }));
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      calls.push(m);
      if (m.type === 'auth') {
        assert.equal(m.access_token, 'test-token');
        ws.send(JSON.stringify({ type: 'auth_ok' }));
      } else if (m.type === 'subscribe_events') ws.send(JSON.stringify({ id: m.id, type: 'result', success: true, result: null }));
      else if (m.type === 'get_states') ws.send(JSON.stringify({ id: m.id, type: 'result', success: true, result: [
        { entity_id: 'light.office', state: 'off', last_updated: '2026-01-01T00:00:00Z', attributes: { friendly_name: 'Büro', brightness: 128 } },
        { entity_id: 'scene.evening', state: '2026-01-01T00:00:00Z', attributes: { friendly_name: 'Abend' } },
      ] }));
      else if (m.type === 'call_service') ws.send(JSON.stringify({ id: m.id, type: 'result', success: true, result: {} }));
    });
  });
  source.setIds(['light.office', 'light.office#brightness']);
  const connected = once(source, 'connection');
  source.start({ url: `http://127.0.0.1:${server.address().port}`, token: 'test-token' });
  await connected;
  assert.equal(source.connected, true);
  assert.equal(source.states.get('light.office').val, false);
  assert.equal(source.states.get('light.office#brightness').val, 128);
  assert.ok(source.search('büro').some((item) => item.id === 'light.office'));
  assert.ok(source.search('büro').some((item) => item.id === 'light.office#brightness'));
  const proposal = source.discover();
  assert.equal(proposal.rooms[0].name, 'Home Assistant');
  assert.deepEqual(proposal.devices[0].states, { power: 'light.office', brightness: 'light.office#brightness' });
  assert.equal(proposal.devices[0].options.brightnessMax, 255);
  assert.deepEqual(proposal.scenes[0].actions, [{ state: 'scene.evening', value: true }]);
  assert.equal(source.search('Abend')[0].write, true);
  await source.set('light.office', true);
  assert.ok(calls.some((m) => m.type === 'call_service' && m.service === 'turn_on'));
  const changed = once(source, 'state');
  peer.send(JSON.stringify({ type: 'event', event: { event_type: 'state_changed', data: { entity_id: 'light.office', new_state: { entity_id: 'light.office', state: 'on', attributes: { brightness: 200 } } } } }));
  const [id, entry] = await changed;
  assert.equal(id, 'light.office');
  assert.equal(entry.val, true);
  assert.equal(source.states.get('light.office#brightness').val, 200);
});

test('A state change during initial snapshot wins over the older snapshot', async (t) => {
  const server = new WebSocketServer({ port: 0 });
  await once(server, 'listening');
  const source = new HomeAssistantSource();
  t.after(() => { source.stop(); server.close(); });
  server.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'auth_required' }));
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      if (m.type === 'auth') ws.send(JSON.stringify({ type: 'auth_ok' }));
      if (m.type === 'subscribe_events') ws.send(JSON.stringify({ id: m.id, type: 'result', success: true, result: null }));
      if (m.type === 'get_states') {
        ws.send(JSON.stringify({ type: 'event', event: { event_type: 'state_changed', data: { new_state: { entity_id: 'sensor.temp', state: '22', attributes: {} } } } }));
        ws.send(JSON.stringify({ id: m.id, type: 'result', success: true, result: [{ entity_id: 'sensor.temp', state: '20', attributes: {} }] }));
      }
    });
  });
  source.setIds(['sensor.temp']);
  const connected = once(source, 'connection');
  source.start({ url: `http://127.0.0.1:${server.address().port}`, token: 'test-token' });
  await connected;
  assert.equal(source.states.get('sensor.temp').val, 22);
});

test('Invalid authentication reports an error without retrying', async (t) => {
  const server = new WebSocketServer({ port: 0 });
  await once(server, 'listening');
  const source = new HomeAssistantSource({ retryMs: 20 });
  t.after(() => { source.stop(); server.close(); });
  let connections = 0;
  server.on('connection', (ws) => {
    connections++;
    ws.send(JSON.stringify({ type: 'auth_required' }));
    ws.on('message', () => ws.send(JSON.stringify({ type: 'auth_invalid' })));
  });
  const disconnected = once(source, 'connection');
  source.start({ url: `http://127.0.0.1:${server.address().port}`, token: 'invalid' });
  await disconnected;
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(connections, 1);
  assert.match(source.error, /ungültig/);
});

test('A disconnected source clears stale values and reconnects', async (t) => {
  const server = new WebSocketServer({ port: 0 });
  await once(server, 'listening');
  const source = new HomeAssistantSource({ retryMs: 20 });
  t.after(() => { source.stop(); server.close(); });
  let peer;
  let connections = 0;
  server.on('connection', (ws) => {
    peer = ws;
    connections++;
    ws.send(JSON.stringify({ type: 'auth_required' }));
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      if (m.type === 'auth') ws.send(JSON.stringify({ type: 'auth_ok' }));
      if (m.type === 'subscribe_events') ws.send(JSON.stringify({ id: m.id, type: 'result', success: true, result: null }));
      if (m.type === 'get_states') ws.send(JSON.stringify({ id: m.id, type: 'result', success: true, result: [{ entity_id: 'sensor.temp', state: String(connections), attributes: {} }] }));
    });
  });
  source.setIds(['sensor.temp']);
  const first = once(source, 'connection');
  source.start({ url: `http://127.0.0.1:${server.address().port}`, token: 'test-token' });
  await first;
  assert.equal(source.states.get('sensor.temp').val, 1);
  const cleared = once(source, 'state');
  peer.close();
  assert.equal((await cleared)[1].val, null);
  assert.equal(source.connected, false);
  const deadline = Date.now() + 2000;
  while (!source.connected && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(source.connected, true);
  assert.equal(source.states.get('sensor.temp').val, 2);
});
