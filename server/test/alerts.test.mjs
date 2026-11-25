// User-defined notifications and page layouts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AlertMonitor, conditionHolds, formatValue, jsonFileStore, sanitizeAlerts } from '../src/alerts.js';
import { sanitizeLayouts } from '../src/layouts.js';

const rule = (o) => sanitizeAlerts([{ id: 'r', name: 'Regel', state: 's', ...o }])[0];

test('conditions: numeric with hysteresis, equality, switches', () => {
  const hot = rule({ op: '>', value: 65, hysteresis: 3 });
  assert.equal(conditionHolds(hot, 66), true);
  assert.equal(conditionHolds(hot, 64), false);
  assert.equal(conditionHolds(hot, 64, true), true, 'active alert stays until below 62');
  assert.equal(conditionHolds(hot, 61.9, true), false);
  assert.equal(conditionHolds(hot, '70'), true, 'numeric strings count');
  assert.equal(conditionHolds(hot, 'abc'), false);
  assert.equal(conditionHolds(hot, null), false);
  const cold = rule({ op: '<', value: 3, hysteresis: 1 });
  assert.equal(conditionHolds(cold, 2), true);
  assert.equal(conditionHolds(cold, 3.5, true), true);
  assert.equal(conditionHolds(cold, 4.1, true), false);
  assert.equal(conditionHolds(rule({ op: '==', value: 'auto' }), 'auto'), true);
  assert.equal(conditionHolds(rule({ op: '==', value: 2 }), '2'), true);
  assert.equal(conditionHolds(rule({ op: '!=', value: 'auto' }), 'heat'), true);
  assert.equal(conditionHolds(rule({ op: 'on' }), true), true);
  assert.equal(conditionHolds(rule({ op: 'on' }), 'true'), true);
  assert.equal(conditionHolds(rule({ op: 'off' }), 0), true);
});

test('sanitizeAlerts: defaults and invalid input', () => {
  const [r] = sanitizeAlerts([{ op: 'xx', value: 'abc', severity: 'nope', view: 'evil', delaySeconds: -5, hysteresis: 'x', extra: 1 }]);
  assert.deepEqual(r, {
    id: 'alarm_1',
    name: 'Benachrichtigung 1',
    enabled: true,
    state: '',
    op: '>',
    value: 0,
    hysteresis: 0,
    delaySeconds: 0,
    severity: 'warning',
    message: '',
    view: '',
    room: '',
    requireAck: false,
    push: true,
  });
  assert.deepEqual(sanitizeAlerts('x'), []);
  assert.equal(sanitizeAlerts([{ push: false }])[0].push, false);
  assert.equal(sanitizeAlerts([{ op: '==', value: 'auto' }])[0].value, 'auto');
  assert.equal(sanitizeAlerts([{ severity: 'alarm' }])[0].requireAck, true, 'alarms need acknowledgement by default');
  assert.equal(sanitizeAlerts([{ severity: 'alarm', requireAck: false }])[0].requireAck, false);
  assert.equal(sanitizeAlerts([{ severity: 'info', requireAck: true }])[0].requireAck, true);
  assert.equal(formatValue(21.456), '21,5');
  assert.equal(formatValue(true), 'an');
});

test('monitor: raises, refreshes, clears and sorts by severity', () => {
  const rules = [rule({ id: 'a', op: '>', value: 10, severity: 'info', message: 'A {value}' }), rule({ id: 'b', state: 't', op: 'on', severity: 'alarm', requireAck: false, view: 'climate', room: 'bad' })];
  const m = new AlertMonitor(() => rules);
  const changes = [];
  m.on('change', (l) => changes.push(l));
  m.onState('s', { val: 11 });
  assert.equal(m.list()[0].message, 'A 11');
  m.onState('s', { val: 12 });
  assert.equal(m.list()[0].message, 'A 12', 'value in the message is refreshed');
  m.evaluateAll(new Map([['t', { val: true }]]));
  assert.deepEqual(m.list().map((a) => a.id), ['b', 'a'], 'alarm before info');
  assert.equal(m.list()[0].view, 'climate');
  assert.equal(m.list()[0].room, 'bad');
  m.onState('s', { val: 5 });
  assert.deepEqual(m.list().map((a) => a.id), ['b']);
  m.reset();
  assert.equal(m.list().length, 0);
  assert.equal(changes.length, 5);
});

test('monitor: disabled rules are ignored, delayed rules wait', async () => {
  const rules = [rule({ id: 'off', enabled: false, op: '>', value: 0 }), rule({ id: 'slow', op: '>', value: 0, delaySeconds: 1 })];
  let current = 5;
  const m = new AlertMonitor(() => rules, () => current);
  m.onState('s', { val: 5 });
  assert.equal(m.list().length, 0, 'delay not elapsed yet');
  m.onState('s', { val: -1 }); // breaks the condition -> timer cancelled
  m.onState('s', { val: 5 });
  current = 7;
  await new Promise((r) => setTimeout(r, 1100));
  assert.deepEqual(m.list().map((a) => [a.id, a.value]), [['slow', 7]]);
  m.stop();
});

test('sanitizeLayouts keeps known pages and cleans the lists', () => {
  const l = sanitizeLayouts({ lights: { groupBy: 'type', groupOrder: ['b', 'a', 'a', 3], hidden: ['x'] }, other: {} });
  assert.deepEqual(Object.keys(l), ['lights', 'climate', 'rooms']);
  assert.deepEqual(l.lights, { groupBy: 'type', groupOrder: ['b', 'a'], deviceOrder: [], hidden: ['x'] });
  assert.equal(l.climate.groupBy, 'default');
  assert.equal(l.rooms.groupBy, 'default');
  assert.equal(sanitizeLayouts({ climate: { groupBy: 'evil' } }).climate.groupBy, 'default');
});

test('alarms stay until acknowledged, also after the condition is gone', () => {
  const rules = [rule({ id: 'door', op: 'on', severity: 'alarm' }), rule({ id: 'hum', state: 'h', op: '>', value: 60 })];
  const m = new AlertMonitor(() => rules);
  m.onState('s', { val: true });
  m.onState('h', { val: 70 });
  assert.deepEqual(m.list().map((a) => [a.id, a.requireAck, a.acked, a.cleared]), [['door', true, false, false], ['hum', false, false, false]], 'unacknowledged alarm first');
  const since = m.list()[0].since;
  m.onState('s', { val: false });
  m.onState('h', { val: 50 });
  assert.deepEqual(m.list().map((a) => [a.id, a.cleared]), [['door', true]], 'the alarm stays, the warning is gone');
  assert.ok(m.list()[0].clearedAt);
  m.onState('s', { val: true });
  assert.equal(m.list()[0].cleared, false, 'raised again');
  assert.equal(m.list()[0].since, since, 'keeps its first start time while unacknowledged');
  m.onState('s', { val: false });
  assert.equal(m.ack('door'), true);
  assert.equal(m.list().length, 0, 'a cleared alarm disappears when acknowledged');
  assert.equal(m.ack('door'), false, 'nothing left to acknowledge');
});

test('acknowledging an active alarm keeps it until the condition is gone', () => {
  const rules = [rule({ id: 'a', op: '>', value: 10, severity: 'alarm' }), rule({ id: 'b', state: 't', op: 'on', severity: 'alarm' })];
  const m = new AlertMonitor(() => rules);
  m.onState('s', { val: 11 });
  m.onState('t', { val: true });
  assert.equal(m.ack('a'), true);
  assert.deepEqual(m.list().map((x) => [x.id, x.acked]), [['b', false], ['a', true]], 'acknowledged ones move behind the open ones');
  m.onState('s', { val: 12 });
  assert.equal(m.list().find((x) => x.id === 'a').acked, true, 'a new value keeps the acknowledgement');
  m.onState('s', { val: 5 });
  assert.equal(m.list().some((x) => x.id === 'a'), false, 'acknowledged + condition gone -> removed');
  m.onState('t', { val: false });
  assert.equal(m.ackAll(), 1);
  assert.equal(m.list().length, 0);
  assert.equal(m.ackAll(), 0);
});

test('configuration changes keep open alarms of rules that still require acknowledgement', () => {
  let rules = [rule({ id: 'a', op: 'on', severity: 'alarm' }), rule({ id: 'b', state: 't', op: 'on', severity: 'alarm' }), rule({ id: 'c', state: 'u', op: 'on' })];
  const m = new AlertMonitor(() => rules);
  for (const id of ['s', 't', 'u']) m.onState(id, { val: true });
  m.onState('s', { val: false });
  rules = [rule({ id: 'a', name: 'Neu', op: 'on', severity: 'alarm' }), rule({ id: 'c', state: 'u', op: 'on' })];
  m.reset();
  assert.deepEqual(m.list().map((x) => [x.id, x.name, x.cleared]), [['a', 'Neu', true]], 'deleted rule and normal alert are gone');
});

test('open alarms are persisted and restored after a restart', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'homeapp-alerts-'));
  const file = path.join(dir, 'alerts.json');
  const rules = [rule({ id: 'door', op: 'on', severity: 'alarm' }), rule({ id: 'info', state: 't', op: 'on', severity: 'info' })];
  const m1 = new AlertMonitor(() => rules, undefined, jsonFileStore(file));
  m1.onState('s', { val: true });
  m1.onState('t', { val: true });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).map((a) => a.id), ['door'], 'only unacknowledged alarms are stored');
  const m2 = new AlertMonitor(() => rules, undefined, jsonFileStore(file));
  m2.reset();
  assert.deepEqual(m2.list().map((a) => a.id), ['door']);
  m2.evaluateAll(new Map([['s', { val: false }]]));
  assert.equal(m2.list()[0].cleared, true, 'the condition is gone after the restart, the alarm stays');
  m2.ack('door');
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), []);
  assert.deepEqual(jsonFileStore(path.join(dir, 'missing.json')).load(), []);
  fs.rmSync(dir, { recursive: true, force: true });
});