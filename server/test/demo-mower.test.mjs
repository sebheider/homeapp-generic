// Simulated robotic mower of the demo mode (demo-mower.js) and its wiring into the demo source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DemoMower } from '../src/demo-mower.js';
import { DemoSource } from '../src/demo.js';

const KEYS = ['state', 'battery', 'progress', 'area', 'x', 'y', 'heading', 'track', 'frame', 'station', 'start', 'pause', 'resume', 'home', 'resetMap'];
const ids = Object.fromEntries(KEYS.map((k) => [k, `m.${k}`]));
const values = (m) => Object.fromEntries(m.entries(0).map(([id, v]) => [id.slice(2), v]));

test('starts in the middle of a session and reports like the navimow adapter', () => {
  const m = new DemoMower(ids);
  const v = values(m);
  assert.equal(v.state, 'isRunning');
  assert.equal(v.progress, 38);
  assert.ok(v.area > 50 && v.area < 55);
  const track = JSON.parse(v.track);
  assert.equal(track.percentage, 38);
  assert.ok(track.points.length > 10);
  assert.ok(track.points.every((p) => p.length === 3 && p.every(Number.isFinite)));
  assert.deepEqual(JSON.parse(v.station), { x: 8.6, y: -6 });
  assert.equal(JSON.parse(v.frame).minX, -9);
  // buttons are written, not reported
  assert.equal(v.start, undefined);
});

test('pause, resume and the way home to the station', () => {
  const m = new DemoMower(ids);
  m.command('pause', true);
  const x = values(m).x;
  m.tick();
  assert.equal(values(m).state, 'isPaused');
  assert.equal(values(m).x, x, 'a paused mower stands still');
  m.command('resume', true);
  m.tick();
  assert.equal(values(m).state, 'isRunning');
  m.command('home', true);
  assert.equal(values(m).state, 'isDocking');
  for (let i = 0; i < 40 && values(m).state !== 'isDocked'; i++) m.tick();
  assert.equal(values(m).state, 'isDocked');
  assert.deepEqual([values(m).x, values(m).y], [8.6, -6]);
  // start: back to the lane where it stopped, the session goes on
  const progress = values(m).progress;
  m.command('start', true);
  m.tick();
  assert.equal(values(m).state, 'isRunning');
  assert.equal(values(m).progress, progress);
});

test('reset map and a forgotten charging station', () => {
  const m = new DemoMower(ids);
  m.command('resetMap', true);
  assert.equal(JSON.parse(values(m).track).points.length, 1);
  m.command('station', '');
  assert.equal(values(m).station, '');
  m.command('home', true);
  for (let i = 0; i < 40 && values(m).state !== 'isDocked'; i++) m.tick();
  assert.deepEqual(JSON.parse(values(m).station), { x: 8.6, y: -6 }, 'the next docking determines the station again');
  assert.equal(m.command('unknown', true), false);
});

test('a session ends with the whole lawn mowed and the mower back in the station', () => {
  const m = new DemoMower(ids);
  m.battery = 100;
  for (let i = 0; i < 2000 && !m.done; i++) {
    m.battery = 100;
    m.tick();
  }
  assert.equal(m.done, true);
  assert.equal(values(m).progress, 100);
  assert.equal(values(m).state, 'isDocking');
});

test('demo source routes the mower buttons to the simulation', async () => {
  const demo = new DemoSource();
  demo.start();
  try {
    const mower = demo.content.devices.find((d) => d.type === 'mower');
    assert.ok(mower, 'the demo installation has a mower');
    assert.equal(demo.val(mower.states.state), 'isRunning');
    assert.equal(demo.objects.get(mower.states.start).type, 'boolean');
    await demo.set(mower.states.pause, true);
    assert.equal(demo.val(mower.states.state), 'isPaused');
    assert.equal(demo.val(mower.states.pause), false, 'buttons keep their value');
  } finally {
    demo.stop();
  }
});
