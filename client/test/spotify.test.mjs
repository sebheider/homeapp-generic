import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NEXT_REPEAT, applyCommand, livePosition, mmss, sameDevice, showOnDashboard } from '../src/lib/spotify.ts';

const track = { id: 't', uri: 'spotify:track:t', type: 'track', name: 'Song', artists: 'Anna', album: 'A', albumUri: null, image: null, imageSmall: null, duration: 200000 };
const state = (p = {}) => ({
  enabled: true, demo: false, connected: true, error: null, account: 'Alex', active: true, playing: true,
  device: { id: 'amp', name: 'AV-Receiver', type: 'AVR', volume: 40, supportsVolume: true },
  track, progress: 60000, shuffle: false, repeat: 'off', context: null,
  can: { next: true, previous: true, seek: true, shuffle: true, repeat: true },
  lastPlayingAt: 1000, updatedAt: 1000, receivedAt: 1000, ...p,
});
const cfg = (p = {}) => ({ dashboard: true, device: '', onlyDevice: true, pauseMinutes: 5, ...p });

test('live position runs while playing, stops at the end and while paused', () => {
  assert.equal(livePosition(state(), 6000), 65000);
  assert.equal(livePosition(state({ playing: false }), 60000), 60000);
  assert.equal(livePosition(state(), 1000 + 500000), 200000, 'not past the end');
  assert.equal(livePosition(state({ receivedAt: undefined }), 9000), 60000);
  assert.equal(livePosition(null), 0);
});

test('times are shown as m:ss / h:mm:ss', () => {
  assert.equal(mmss(0), '0:00');
  assert.equal(mmss(65400), '1:05');
  assert.equal(mmss(3723000), '1:02:03');
  assert.equal(mmss(-1), '0:00');
  assert.equal(mmss(null), '0:00');
});

test('repeat cycles through off, all and this track', () => {
  assert.equal(NEXT_REPEAT.off, 'context');
  assert.equal(NEXT_REPEAT.context, 'track');
  assert.equal(NEXT_REPEAT.track, 'off');
});

test('the mini player shows while music plays and a few minutes after pausing', () => {
  const now = 1000 + 60000;
  assert.equal(showOnDashboard(state(), cfg(), now), true);
  assert.equal(showOnDashboard(state({ playing: false }), cfg(), now), true, 'paused one minute ago');
  assert.equal(showOnDashboard(state({ playing: false }), cfg(), 1000 + 5 * 60000), false, 'grace time over');
  assert.equal(showOnDashboard(state({ playing: false }), cfg({ pauseMinutes: 0 }), now), false, '0 = hide right away');
  assert.equal(showOnDashboard(state({ playing: false, lastPlayingAt: 0 }), cfg(), now), false, 'never played since the start');
  assert.equal(showOnDashboard(state({ active: false }), cfg(), now), false, 'nothing active');
  assert.equal(showOnDashboard(state({ track: null }), cfg(), now), false);
  assert.equal(showOnDashboard(state({ connected: false }), cfg(), now), false);
  assert.equal(showOnDashboard(state(), cfg({ dashboard: false }), now), false, 'switched off');
  assert.equal(showOnDashboard(null, cfg(), now), false);
});

test('a chosen device restricts the mini player to it (unless switched off)', () => {
  const now = 2000;
  assert.equal(showOnDashboard(state(), cfg({ device: ' av-receiver ' }), now), true);
  assert.equal(showOnDashboard(state({ device: { id: 'p', name: 'Handy', type: 'Smartphone', volume: null, supportsVolume: false } }), cfg({ device: 'AV-Receiver' }), now), false);
  assert.equal(showOnDashboard(state({ device: { id: 'p', name: 'Handy', type: 'Smartphone', volume: null, supportsVolume: false } }), cfg({ device: 'AV-Receiver', onlyDevice: false }), now), true);
  assert.equal(sameDevice('Küche ', 'küche'), true);
  assert.equal(sameDevice(null, 'x'), false);
});

test('commands show their effect at once', () => {
  const s = state();
  const paused = applyCommand(s, { action: 'pause' }, 11000);
  assert.deepEqual([paused.playing, paused.progress, paused.receivedAt, paused.lastPlayingAt], [false, 70000, 11000, 11000]);
  assert.equal(livePosition(paused, 99000), 70000, 'frozen while paused');
  const resumed = applyCommand(paused, { action: 'play' }, 20000);
  assert.deepEqual([resumed.playing, resumed.progress], [true, 70000]);
  assert.equal(applyCommand(s, { action: 'play', uris: ['spotify:track:x'] }, 5000).progress, 0);
  assert.equal(applyCommand(s, { action: 'next' }, 5000).progress, 0);
  assert.equal(applyCommand(s, { action: 'seek', position: 120000 }, 5000).progress, 120000);
  assert.equal(applyCommand(s, { action: 'volume', volume: 70 }).device.volume, 70);
  assert.equal(applyCommand(state({ device: null }), { action: 'volume', volume: 70 }).device, null);
  assert.equal(applyCommand(s, { action: 'shuffle', state: true }).shuffle, true);
  assert.equal(applyCommand(s, { action: 'repeat', state: 'track' }).repeat, 'track');
  assert.equal(applyCommand(s, { action: 'queue', uri: 'spotify:track:x' }), s);
  assert.equal(s.playing, true, 'the old state is not changed');
});
