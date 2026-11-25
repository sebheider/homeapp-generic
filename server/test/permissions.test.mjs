import assert from 'node:assert/strict';
import test from 'node:test';
import { analyseWrite, buildFixScript, controlIds, userIdOf } from '../src/permissions.js';

const admin = { owner: 'system.user.admin', ownerGroup: 'system.group.administrator', state: 0x664, object: 0x664 };

test('user id from login name', () => {
  assert.equal(userIdOf('homeapp'), 'system.user.homeapp');
  assert.equal(userIdOf(' Home App '), 'system.user.home_app');
});

test('user in group "user" is "others" for admin-owned states (the reported problem)', () => {
  const r = analyseWrite(admin, 'system.user.homeapp', ['system.group.user'], true);
  assert.deepEqual(r, { writable: false, reason: 'others' });
});

test('member of the owner group may write with 0x664', () => {
  assert.equal(analyseWrite(admin, 'system.user.homeapp', ['system.group.user', 'system.group.administrator'], true).writable, true);
});

test('others-write bit (0x666) fixes it', () => {
  assert.equal(analyseWrite({ ...admin, state: 0x666 }, 'system.user.homeapp', ['system.group.user'], true).writable, true);
});

test('owner uses the owner bits', () => {
  assert.equal(analyseWrite({ ...admin, owner: 'system.user.homeapp' }, 'system.user.homeapp', [], true).writable, true);
  assert.equal(analyseWrite({ ...admin, owner: 'system.user.homeapp', state: 0x464 }, 'system.user.homeapp', [], true).writable, false);
});

test('without group write permission nothing is writable', () => {
  assert.deepEqual(analyseWrite({ ...admin, state: 0x666 }, 'system.user.homeapp', ['system.group.user'], false), { writable: false, reason: 'groups' });
});

test('missing acl means no restriction', () => {
  assert.equal(analyseWrite(undefined, 'system.user.homeapp', ['system.group.user'], true).writable, true);
});

test('control ids: only writable fields of devices and scene actions', () => {
  const cfg = {
    devices: [
      { type: 'light', states: { power: 'a.on', brightness: 'a.bri' } },
      { type: 'thermostat', states: { target: 't.set', current: 't.cur', valve: 't.valve' } },
      { type: 'sensor', states: { value: 's.v' } },
      { type: 'mower', states: { state: 'm.state', battery: 'm.bat', start: 'm.start', home: 'm.dock', station: 'm.station' } },
    ],
    scenes: [{ actions: [{ state: 'x.btn', value: true }, { state: 'a.on', value: false }] }],
  };
  assert.deepEqual(controlIds(cfg).sort(), ['a.bri', 'a.on', 'm.dock', 'm.start', 'm.station', 't.set', 'x.btn']);
});

test('fix script is valid JavaScript and lists the ids', () => {
  const script = buildFixScript(['hue.0.A.on', 'hm-rpc.1.X.1.LEVEL']);
  assert.match(script, /"hue\.0\.A\.on"/);
  assert.match(script, /0x002/);
  // must at least parse
  assert.doesNotThrow(() => new Function('getObject', 'extendObject', 'log', script));
});
