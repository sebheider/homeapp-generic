// Basic Auth check, camera list and the small shared helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { basicAuth, safeEqual } from '../src/auth.js';
import { buildCameraList } from '../src/cameras.js';
import { searchObjects, round, clamp, isOn, escapeRegExp } from '../src/util.js';
import { writeFileAtomic } from '../src/util/fs.js';
import { clampNumber, finiteOrNull, round1 } from '../src/util/number.js';
import { nextDelay } from '../src/util/timers.js';

const header = (user, pass) => `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;

test('basicAuth: open without credentials, strict with credentials', () => {
  assert.equal(basicAuth('', '')(undefined), true);
  const check = basicAuth('anna', 'geheim:mit:doppelpunkt');
  assert.equal(check(header('anna', 'geheim:mit:doppelpunkt')), true, 'colons in the password are allowed');
  assert.equal(check(header('anna', 'falsch')), false);
  assert.equal(check(header('bob', 'geheim:mit:doppelpunkt')), false);
  assert.equal(check(undefined), false);
  assert.equal(check('Bearer abc'), false);
  assert.equal(safeEqual('token', 'token'), true);
  assert.equal(safeEqual('token', 'tokenx'), false);
});

test('buildCameraList: overrides, configured-only cameras, motion fallback, hidden cameras', () => {
  const list = buildCameraList({
    isDemo: false,
    reported: [
      { id: '1', name: 'Cam1', enabled: true },
      { id: '2', name: 'Cam2', enabled: false },
      { id: '3', name: 'Cam3' },
    ],
    configured: [
      { id: 1, name: 'Eingang', room: 'aussen', popupPeople: false, motionState: 'x.motion' },
      { id: '3', hidden: true },
      { id: '9' },
    ],
    recentMotion: [{ cameraId: '21', name: 'Terrasse' }, { cameraId: '1', name: 'ignored' }],
  });
  assert.deepEqual(list.map((c) => c.id), ['1', '2', '9', '21']);
  assert.deepEqual(list[0], {
    id: '1',
    name: 'Eingang',
    room: 'aussen',
    enabled: true,
    hidden: false,
    popup: true,
    popupMotion: true,
    popupPeople: false,
    motionState: 'x.motion',
    peopleState: null,
  });
  assert.equal(list[1].enabled, false);
  assert.equal(list[2].name, 'Kamera 9');
  assert.equal(list[3].name, 'Terrasse');
});

test('buildCameraList: in demo mode only the configured cameras count', () => {
  const list = buildCameraList({ isDemo: true, reported: [{ id: '7', name: 'x' }], configured: [{ id: '1', name: 'Eingang' }], recentMotion: [{ cameraId: '5', name: 'y' }] });
  assert.deepEqual(list.map((c) => [c.id, c.name]), [['1', 'Eingang']]);
});

test('util helpers', () => {
  const objects = [
    { id: 'hm.0.a.STATE', name: 'Küche Licht' },
    { id: 'hm.0.b.STATE', name: 'Bad Licht' },
    { id: 'hm.0.c.LEVEL', name: 'Küche Rollladen' },
  ];
  assert.deepEqual(searchObjects(objects, 'küche state').map((o) => o.id), ['hm.0.a.STATE']);
  assert.equal(searchObjects(objects, '', 2).length, 2, 'stops at the limit');
  assert.equal(round(1.23456, 2), 1.23);
  assert.equal(round(2.25), 2.3);
  assert.equal(clamp(12, 0, 10), 10);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.deepEqual([true, 1, 'true', false, 0, 'false', null].map(isOn), [true, true, true, false, false, false, false]);
  assert.equal(new RegExp(`^${escapeRegExp('a.b (c)')}$`).test('a.b (c)'), true);
});

test('number helpers: clampNumber, finiteOrNull, round1, nextDelay', () => {
  assert.deepEqual([null, undefined, '', 'x', NaN].map((v) => clampNumber(v, 1, 10, 5)), [5, 5, 5, 5, 5]);
  assert.deepEqual(['3', 0, 12, -4.5].map((v) => clampNumber(v, 1, 10, 5)), [3, 1, 10, 1]);
  assert.deepEqual([1.5, '2', NaN, Infinity, null].map(finiteOrNull), [1.5, null, null, null, null]);
  assert.equal(round1(21.26), 21.3);
  assert.equal(round1(null), null);
  assert.deepEqual([0, 1000, 8000, 16000].map((d) => nextDelay(d, 1000, 15000)), [1000, 2000, 15000, 15000]);
});

test('writeFileAtomic replaces the file and retries a busy rename', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'homeapp-atomic-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'data.json');
  writeFileAtomic(file, '{"a":1}');
  assert.equal(fs.readFileSync(file, 'utf8'), '{"a":1}');
  assert.equal(fs.existsSync(`${file}.tmp`), false);

  const rename = fs.renameSync;
  let calls = 0;
  const busy = (code, times) => (from, to) => {
    calls++;
    if (calls <= times) throw Object.assign(new Error(`${code}: rename failed`), { code });
    return rename(from, to);
  };
  let mocked = t.mock.method(fs, 'renameSync', busy('EPERM', 2));
  writeFileAtomic(file, '{"a":2}', { retries: 3 });
  assert.equal(calls, 3, 'two busy attempts, then success');
  assert.equal(fs.readFileSync(file, 'utf8'), '{"a":2}');
  mocked.mock.restore();

  calls = 0;
  mocked = t.mock.method(fs, 'renameSync', busy('EBUSY', 5));
  assert.throws(() => writeFileAtomic(file, '{"a":3}', { retries: 2 }), { code: 'EBUSY' });
  assert.equal(calls, 3, 'gives up after the retries');
  mocked.mock.restore();

  calls = 0;
  mocked = t.mock.method(fs, 'renameSync', busy('ENOSPC', 1));
  assert.throws(() => writeFileAtomic(file, '{"a":4}', { retries: 5 }), { code: 'ENOSPC' });
  assert.equal(calls, 1, 'other errors are not retried');
  mocked.mock.restore();

  calls = 0;
  t.mock.method(fs, 'renameSync', busy('EPERM', 1));
  assert.throws(() => writeFileAtomic(file, '{"a":5}'), { code: 'EPERM' });
  assert.equal(calls, 1, 'no retries by default');
});
