import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRINTER_POPUP_HIDDEN_KEY, PRINTER_STATE, amsHumidity, bambuJobLine, duration, fileLabel, filamentText, finishTime, loadHiddenPrinterJob, percent, printerStatus, saveHiddenPrinterJob,
  isLightColor, shouldShowPrinterPopup, sourceName, webcamTransform, wifiText,
} from '../src/lib/printer.ts';

function storage(t) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  });
  return values;
}

test('state label: an unreachable OctoPrint wins over the last printer state', () => {
  assert.equal(printerStatus({ connected: true, error: null, state: 'printing' }).label, 'Druckt');
  assert.equal(printerStatus({ connected: true, error: null, state: 'paused' }).label, 'Pausiert');
  assert.equal(printerStatus({ connected: false, error: 'API-Key ungültig', state: 'printing' }).label, 'Nicht erreichbar');
  assert.equal(printerStatus({ connected: false, error: null, state: 'offline' }).label, 'Verbindet …');
  assert.equal(printerStatus(null).label, 'Nicht eingerichtet');
  assert.equal(printerStatus({ connected: true, error: null, state: 'bogus' }).label, 'Unbekannt');
  for (const s of Object.values(PRINTER_STATE)) assert.match(s.color, /^#[0-9a-f]{6}$/);
});

test('durations, end time, percent, file name and filament', () => {
  assert.equal(duration(4810), '1 h 20 min');
  assert.equal(duration(7260), '2 h 01 min');
  assert.equal(duration(2700), '45 min');
  assert.equal(duration(20), '< 1 min');
  assert.equal(duration(null), '–');
  assert.equal(duration(-5), '–');

  const now = new Date(2026, 9, 25, 14, 0, 0).getTime();
  assert.equal(finishTime(4810, now), '15:20');
  assert.equal(finishTime(11 * 3600, now), 'morgen 01:00');
  assert.match(finishTime(40 * 3600, now), /^\S+ 06:00$/);
  assert.equal(finishTime(null, now), null);

  assert.equal(percent({ progress: { completion: 76.9 } }), 76);
  assert.equal(percent({ progress: { completion: 100 } }), 100);
  assert.equal(percent({ progress: null }), null);
  assert.equal(percent(null), null);
  assert.equal(fileLabel('Tablet_0.2mm_PETG.gcode'), 'Tablet_0.2mm_PETG');
  assert.equal(fileLabel('Box.BGCODE'), 'Box');
  assert.equal(fileLabel(undefined), '');
  assert.equal(filamentText(3812), '3,8 m');
  assert.equal(filamentText(12345), '12 m');
  assert.equal(filamentText(null), null);
});

test('webcam orientation like in OctoPrint', () => {
  assert.equal(webcamTransform({ flipH: false, flipV: false, rotate90: false }), undefined);
  assert.equal(webcamTransform({ flipH: true, flipV: true, rotate90: false }), 'scaleX(-1) scaleY(-1)');
  assert.equal(webcamTransform({ flipH: false, flipV: false, rotate90: true }), 'rotate(-90deg)');
  assert.equal(webcamTransform(undefined), undefined);
});

test('pop-up rules: camera pop-ups win, hidden prints stay quiet, the final pop-up always appears', () => {
  const interval = { reason: 'interval', jobId: 'job1' };
  const done = { reason: 'done', jobId: 'job1' };
  assert.equal(shouldShowPrinterPopup(interval, { hiddenJob: null, cameraPopup: false }), true);
  assert.equal(shouldShowPrinterPopup(interval, { hiddenJob: 'job1', cameraPopup: false }), false);
  assert.equal(shouldShowPrinterPopup(interval, { hiddenJob: 'job0', cameraPopup: false }), true, 'another print');
  assert.equal(shouldShowPrinterPopup(done, { hiddenJob: 'job1', cameraPopup: false }), true);
  assert.equal(shouldShowPrinterPopup(done, { hiddenJob: null, cameraPopup: true }), false);
  assert.equal(shouldShowPrinterPopup(interval, { hiddenJob: null, cameraPopup: false, onPrinterPage: true }), false);
  assert.equal(shouldShowPrinterPopup(done, { hiddenJob: null, cameraPopup: false, onPrinterPage: true }), true);
  assert.equal(shouldShowPrinterPopup({ reason: 'interval', jobId: null }, { hiddenJob: null, cameraPopup: false }), true);
});

test('the hidden print is stored per browser and tolerates broken storage', (t) => {
  const values = storage(t);
  assert.equal(loadHiddenPrinterJob(), null);
  saveHiddenPrinterJob('mvnu0e6r');
  assert.equal(values.get(PRINTER_POPUP_HIDDEN_KEY), 'mvnu0e6r');
  assert.equal(loadHiddenPrinterJob(), 'mvnu0e6r');
  saveHiddenPrinterJob(null);
  assert.equal(values.size, 0);
  values.set(PRINTER_POPUP_HIDDEN_KEY, 'x'.repeat(200));
  assert.equal(loadHiddenPrinterJob(), null, 'implausible values are ignored');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Storage unavailable'); } });
  assert.equal(loadHiddenPrinterJob(), null);
  assert.doesNotThrow(() => saveHiddenPrinterJob('a'));
});

test('Bambu Lab: project files, layer line, WiFi, AMS humidity and spool colours', () => {
  assert.equal(fileLabel('Benchy.gcode.3mf'), 'Benchy');
  assert.equal(fileLabel('plate_1.3mf'), 'plate_1');
  assert.equal(sourceName({ kind: 'bambu' }), 'Drucker');
  assert.equal(sourceName({ kind: 'octoprint' }), 'OctoPrint');

  const bambu = { layer: { current: 63, total: 150 }, stage: 'Drucken' };
  assert.equal(bambuJobLine({ active: true, bambu }), 'Schicht 63 / 150 · Drucken');
  assert.equal(bambuJobLine({ active: true, stateText: 'Drucken', bambu }), 'Schicht 63 / 150');
  assert.equal(bambuJobLine({ active: true, bambu: { layer: { current: 0, total: 0 }, stage: 'Bett leveln' } }), 'Bett leveln');
  assert.equal(bambuJobLine({ active: false, bambu }), null);
  assert.equal(bambuJobLine({ active: true, bambu: null }), null);

  assert.equal(wifiText(-48), '-48 dBm (sehr gut)');
  assert.equal(wifiText(-80), '-80 dBm (schwach)');
  assert.equal(wifiText(null), null);

  assert.equal(amsHumidity({ humidity: 23, humidityLevel: 4 }), '23 %');
  assert.equal(amsHumidity({ humidity: null, humidityLevel: 2 }), 'Stufe 2 von 5');
  assert.equal(amsHumidity({ humidity: null, humidityLevel: 0 }), null);

  assert.equal(isLightColor('#FFFFFF'), true);
  assert.equal(isLightColor('#161616'), false);
  assert.equal(isLightColor(null), false);
});
