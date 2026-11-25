import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BRIDGE_PROTOCOL, activeExtensions, changedValues, extensionConfig, extensionIdOf, extensionPages, extensionValues, extensionView, formatCardValue, initMessage, isExtensionView,
  missingSettings, parseBridgeMessage, resolveWrite,
} from '../src/lib/extensions.ts';
import { addWidget, scalesContent, WIDGETS } from '../src/lib/widgets.ts';
import { validateManifest } from '../../server/src/extensions.js';

// the manifests the client works with are the ones the server cleaned
const pool = validateManifest({
  manifestVersion: 1,
  id: 'pool',
  name: 'Pool',
  version: '1.0.0',
  icon: 'waves',
  settings: [
    { key: 'water', type: 'datapoint', label: 'Wasser', required: true },
    { key: 'pump', type: 'datapoint', label: 'Pumpe', write: true },
    { key: 'free', type: 'datapoint', label: 'Frei', write: true },
    { key: 'title', type: 'text', label: 'Titel', default: 'Pool' },
  ],
  page: { title: 'Schwimmbad', entry: 'index.html' },
  widget: { cards: [{ type: 'value', datapoint: 'water' }], size: [3, 2] },
}, new Set(['module.json', 'index.html']));
const widgetOnly = validateManifest({ manifestVersion: 1, id: 'clock-x', name: 'Uhr', version: '1.0.0', widget: { cards: [{ type: 'text', text: 'x' }] } });
const cfg = { enabled: true, settings: { water: 'pool.water', pump: 'pool.pump', free: '', title: 'Mein Pool' } };

test('page ids of modules', () => {
  assert.equal(extensionView('pool'), 'ext-pool');
  assert.equal(extensionIdOf('ext-pool'), 'pool');
  assert.equal(extensionIdOf('weather'), null);
  assert.equal(isExtensionView('ext-pool'), true);
  for (const v of ['ext-', 'ext-Pool', 'ext-../x', 'pool']) assert.equal(isExtensionView(v), false, v);
});

test('navigation lists enabled modules with a page only', () => {
  const all = { pool: cfg, 'clock-x': { enabled: true, settings: {} } };
  assert.deepEqual(extensionPages([pool, widgetOnly], all), [{ id: 'ext-pool', label: 'Schwimmbad', icon: 'waves' }]);
  assert.deepEqual(extensionPages([pool], { pool: { ...cfg, enabled: false } }), []);
  assert.deepEqual(extensionPages([pool], undefined), []);
  assert.deepEqual(activeExtensions([pool, widgetOnly], all).map((m) => m.id), ['pool', 'clock-x']);
  // a module without stored state shows its defaults, switched off
  assert.deepEqual(extensionConfig(pool, {}), { enabled: false, settings: { water: '', pump: '', free: '', title: 'Pool' } });
  assert.deepEqual(missingSettings(pool, extensionConfig(pool, {})).map((s) => s.key), ['water']);
  assert.deepEqual(missingSettings(pool, cfg), []);
});

test('the module only sees its slots, never the real datapoint ids', () => {
  const states = { 'pool.water': { val: 24.5, ts: 1, ack: true }, 'other.secret': { val: 'x', ts: 1, ack: true } };
  const msg = initMessage(pool, cfg, states, 'page', 'dark', { fg: '#fff' });
  assert.equal(msg.protocol, BRIDGE_PROTOCOL);
  assert.deepEqual(msg.values, { water: { val: 24.5, ts: 1 }, pump: null, free: null });
  assert.deepEqual(msg.settings, { title: 'Mein Pool' });
  assert.deepEqual(msg.datapoints.free, { label: 'Frei', write: true, mapped: false });
  assert.doesNotMatch(JSON.stringify(msg), /pool\.water|other\.secret/);
  assert.deepEqual(extensionValues(pool, cfg, {}), { water: null, pump: null, free: null });
});

test('only changed values are pushed', () => {
  const a = { water: { val: 1, ts: 1 }, pump: null };
  assert.deepEqual(changedValues(a, { water: { val: 1, ts: 1 }, pump: null }), {});
  assert.deepEqual(changedValues(a, { water: { val: 2, ts: 2 }, pump: null }), { water: { val: 2, ts: 2 } });
  assert.deepEqual(changedValues(a, { water: null, pump: { val: true, ts: 3 } }), { water: null, pump: { val: true, ts: 3 } });
});

test('bridge messages are parsed strictly', () => {
  assert.deepEqual(parseBridgeMessage({ protocol: BRIDGE_PROTOCOL, type: 'ready' }), { type: 'ready' });
  assert.deepEqual(parseBridgeMessage({ protocol: BRIDGE_PROTOCOL, type: 'set', requestId: 1, key: 'pump', value: true }), { type: 'set', requestId: 1, key: 'pump', value: true });
  assert.deepEqual(parseBridgeMessage({ protocol: BRIDGE_PROTOCOL, type: 'resize', height: 300 }), { type: 'resize', height: 300 });
  for (const bad of [null, 'x', { type: 'ready' }, { protocol: 'other', type: 'ready' }, { protocol: BRIDGE_PROTOCOL, type: 'set', key: 1, requestId: 1 }, { protocol: BRIDGE_PROTOCOL, type: 'resize', height: NaN }]) {
    assert.equal(parseBridgeMessage(bad), null, JSON.stringify(bad));
  }
});

test('modules may only write released and mapped slots with plain values', () => {
  assert.deepEqual(resolveWrite(pool, cfg, 'pump', true), { id: 'pool.pump' });
  assert.match(resolveWrite(pool, cfg, 'water', 1).error, /nur gelesen/);
  assert.match(resolveWrite(pool, cfg, 'free', 1).error, /keinem Datenpunkt/);
  assert.match(resolveWrite(pool, cfg, 'title', 'x').error, /Unbekannter/);
  assert.match(resolveWrite(pool, cfg, 'pool.pump', true).error, /Unbekannter/);
  assert.match(resolveWrite(pool, cfg, 'pump', { a: 1 }).error, /Nur Text/);
  assert.match(resolveWrite(pool, cfg, 'pump', Infinity).error, /Nur Text/);
});

test('card values are formatted in German', () => {
  assert.equal(formatCardValue(24.456, '°C', 1), '24,5 °C');
  assert.equal(formatCardValue(1234.5), '1.234,5');
  assert.equal(formatCardValue(true), 'an');
  assert.equal(formatCardValue(null, '°C'), '–');
  assert.equal(formatCardValue('offen'), 'offen');
});

test('module widgets: size of the manifest, never scaled', () => {
  const [w] = addWidget([], 'extension', { extension: 'pool' }, [3, 2]);
  assert.deepEqual([w.w, w.h, w.options.extension], [3, 2, 'pool']);
  assert.deepEqual(addWidget([], 'extension').map((x) => [x.w, x.h]), [WIDGETS.extension.size]);
  assert.equal(scalesContent(w), false);
});
