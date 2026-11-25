import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysUntil, nextPickup, pickupDay, pickupText } from '../src/lib/waste.ts';
import { autoRooms, roomsToVentilate, ventilateText } from '../src/lib/ventilation.ts';

const day = (date, ...labels) => ({ date, items: labels.map((label) => ({ summary: label, key: label, label, color: '#000' })) });

test('pickup days relative to today', () => {
  const now = new Date(2026, 10, 2, 18); // Monday
  assert.equal(daysUntil('2026-11-03', now), 1);
  assert.equal(pickupDay('2026-11-02', now), 'Heute');
  assert.equal(pickupDay('2026-11-03', now), 'Morgen');
  assert.equal(pickupDay('2026-11-04', now), 'Übermorgen');
  assert.equal(pickupDay('2026-11-06', now), 'Fr');
  assert.equal(pickupDay('2026-11-10', now), 'Di, 10.11.');
  // across the change to winter time (day length 25 h) the count stays exact
  assert.equal(daysUntil('2026-10-26', new Date(2026, 9, 24, 12)), 2);
});

test('next pickup: today only until noon', () => {
  const days = [day('2026-11-03', 'Biotonne', 'Restmülltonne'), day('2026-11-10', 'Biotonne')];
  assert.equal(nextPickup(days, new Date(2026, 10, 3, 9)).date, '2026-11-03');
  assert.equal(nextPickup(days, new Date(2026, 10, 3, 13)).date, '2026-11-10');
  assert.equal(nextPickup([], new Date()), null);
  assert.equal(pickupText(days[0], new Date(2026, 10, 2, 18)), 'Morgen: Biotonne, Restmülltonne');
});

test('rooms to ventilate: warnings and CO₂ first', () => {
  const r = (name, status, severity, reasons) => ({ name, status, severity, reasons });
  const list = roomsToVentilate([r('Bad', 'ventilate', 'info', ['humidity']), r('Flur', 'ok', 'info', []), r('Büro', 'ventilate', 'info', ['co2']), r('Kind', 'ventilate', 'warning', ['co2'])]);
  assert.deepEqual(list.map((x) => x.name), ['Kind', 'Büro', 'Bad']);
  assert.equal(ventilateText(list), 'Lüften: Kind, Büro +1');
});

test('autoRooms: rooms with humidity or CO₂ sensors, temperature from a thermostat, outdoor rooms skipped', () => {
  const rooms = [{ id: 'bad', name: 'Bad', icon: '' }, { id: 'garten', name: 'Garten', icon: '' }, { id: 'flur', name: 'Flur', icon: '' }];
  const sensor = (id, room, kind, value) => ({ id, type: 'sensor', name: id, room, states: { value }, options: { kind } });
  const devices = [
    sensor('h1', 'bad', 'humidity', 'x.bad.hum'),
    { id: 't1', type: 'thermostat', name: 't', room: 'bad', states: { current: 'x.bad.temp' }, options: {} },
    sensor('w1', 'bad', 'window', 'x.bad.win'),
    sensor('h2', 'garten', 'humidity', 'x.garten.hum'),
    sensor('t2', 'flur', 'temperature', 'x.flur.temp'),
  ];
  assert.deepEqual(autoRooms(rooms, devices), [{ id: 'bad', room: 'bad', name: '', temperature: 'x.bad.temp', humidity: 'x.bad.hum', co2: '', window: 'x.bad.win' }]);
});
