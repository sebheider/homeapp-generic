// Demo source: nothing is emitted once the simulation has been stopped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DemoSource } from '../src/demo.js';

test('mower module can be disabled and re-enabled in demo mode', () => {
  const demo = new DemoSource();
  const mower = demo.content.devices.find((device) => device.type === 'mower');
  demo.start({ mower: false });
  assert.equal(demo.mower, null);
  for (const id of Object.values(mower.states)) {
    assert.equal(demo.states.has(id), false);
    assert.equal(demo.objects.has(id), false);
  }
  demo.start({ mower: true });
  assert.ok(demo.mower);
  assert.ok(demo.states.has(mower.states.state));
  demo.stop();
});

test('stop() cancels pending motion resets and travelling blinds', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const demo = new DemoSource();
  demo.start();
  const blind = demo.content.devices.find((d) => d.type === 'blind');
  const id = blind.states.position;
  demo.states.set(id, { val: 0, ts: 0, ack: true });
  await demo.set(id, 100);
  t.mock.timers.tick(400);
  assert.equal(demo.val(id), 10, 'the blind moves in steps');
  demo.later(() => demo.put('demo.0.x', true), 1000);
  demo.stop();
  let emitted = 0;
  demo.on('state', () => emitted++);
  t.mock.timers.tick(30000);
  assert.equal(emitted, 0);
  assert.equal(demo.travel.size, 0);
  assert.equal(demo.timers.size, 0);
});

test('blinds stop at their target, also for out-of-range values', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const demo = new DemoSource();
  const blind = demo.content.devices.find((d) => d.type === 'blind');
  const id = blind.states.position;
  demo.states.set(id, { val: 90, ts: 0, ack: true });
  await demo.set(id, 150);
  t.mock.timers.tick(400 * 5);
  assert.equal(demo.val(id), 100);
  assert.equal(demo.travel.size, 0);
});
