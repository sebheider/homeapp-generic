import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_DISPLAY, dashboardDesign, effectsLevel, inTimeWindow, kioskScale, launcherColumns, loadDisplay, navShell, kioskZoom, menuMode, menuModeSettings, nextMenuMode, saveDisplay, screenHint, screensaverSpot } from '../src/lib/display.ts';

test('the screensaver is off by default and runs at night with a clock', () => {
  assert.equal(DEFAULT_DISPLAY.screensaver, false);
  assert.equal(DEFAULT_DISPLAY.screensaverClock, true);
  assert.equal(inTimeWindow(DEFAULT_DISPLAY.screensaverFrom, DEFAULT_DISPLAY.screensaverTo, new Date(2026, 0, 1, 2, 30)), true);
  assert.equal(inTimeWindow(DEFAULT_DISPLAY.screensaverFrom, DEFAULT_DISPLAY.screensaverTo, new Date(2026, 0, 1, 12, 0)), false);
});

test('the screensaver clock stays away from the edges and wanders from minute to minute', () => {
  const spots = new Set();
  for (let n = 0; n < 500; n++) {
    const { x, y } = screensaverSpot(29_000_000 + n);
    for (const v of [x, y]) assert.ok(v >= 25 && v <= 75, `${v} out of range`);
    spots.add(`${x}/${y}`);
  }
  assert.ok(spots.size > 250);
  assert.deepEqual(screensaverSpot(42), screensaverSpot(42));
});

test('animation details default to all effects', () => {
  assert.equal(DEFAULT_DISPLAY.effects, 'high');
});

test('hero weather effects default on and individual choices persist on this device', () => {
  const keys = ['heroWeatherRain', 'heroWeatherSnow', 'heroWeatherThunder', 'heroWeatherFog'];
  const oldStorage = globalThis.localStorage;
  const oldLocation = globalThis.location;
  let saved = JSON.stringify({ effects: 'high' });
  globalThis.localStorage = { getItem: () => saved, setItem: (_key, value) => { saved = value; } };
  globalThis.location = { search: '' };
  try {
    let display = loadDisplay();
    for (const key of keys) assert.equal(display[key], true);
    for (const key of keys) {
      display = { ...display, [key]: false };
      saveDisplay(display);
      assert.equal(loadDisplay()[key], false);
    }
    assert.ok(keys.every((key) => loadDisplay()[key] === false));
  } finally {
    if (oldStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = oldStorage;
    if (oldLocation === undefined) delete globalThis.location;
    else globalThis.location = oldLocation;
  }
});

test('known animation detail levels are kept, anything else means all effects', () => {
  for (const level of ['high', 'medium', 'low']) assert.equal(effectsLevel(level), level);
  for (const value of [undefined, null, '', 'LOW', 'off', 1, {}]) assert.equal(effectsLevel(value), 'high');
});

test('the own start page is a valid overview design, anything unknown means standard', () => {
  for (const design of ['standard', 'nexus', 'custom']) assert.equal(dashboardDesign(design), design);
  for (const value of [undefined, null, '', 'Custom', 'evil', 1]) assert.equal(dashboardDesign(value), 'standard');
});

test('the menu starts full and the modes map to the stored settings', () => {
  assert.equal(menuMode(DEFAULT_DISPLAY), 'full');
  for (const mode of ['full', 'small', 'hidden']) assert.equal(menuMode(menuModeSettings(mode)), mode);
  assert.equal(menuMode({ menuPinned: false, menuCompact: true }), 'hidden');
});

test('the hide button steps full -> small -> hidden on desktops and hides directly on tablets', () => {
  assert.equal(nextMenuMode('full', true), 'small');
  assert.equal(nextMenuMode('small', true), 'hidden');
  assert.equal(nextMenuMode('full', false), 'hidden');
  assert.equal(nextMenuMode('small', false), 'hidden');
});

test('hiding the menu forgets the small size, so pinning it again shows the full menu', () => {
  assert.deepEqual(menuModeSettings('hidden'), { menuPinned: false, menuCompact: false });
  assert.equal(menuMode({ ...menuModeSettings('hidden'), menuPinned: true }), 'full');
});

test('kiosk content scales with screens larger than 1280 × 800, but never shrinks', () => {
  assert.equal(kioskScale(1280, 800), 1);
  assert.equal(kioskScale(1920, 1200), 1.5);
  assert.equal(kioskScale(1920, 1080), 1.35);
  assert.equal(kioskScale(960, 600), 1);
  assert.equal(kioskScale(4000, 3000), 2);
  for (const [w, h] of [[0, 0], [NaN, 800], [1920, -1]]) assert.equal(kioskScale(w, h), 1);
});

test('portrait kiosk screens scale against an 800 × 1280 base', () => {
  assert.equal(kioskScale(800, 1280), 1);
  assert.equal(kioskScale(1200, 1920), 1.5);
  assert.equal(kioskScale(1080, 1920), 1.35);
  assert.equal(kioskScale(600, 960), 1);
});

test('a manual kiosk zoom replaces the automatic factor', () => {
  assert.equal(DEFAULT_DISPLAY.kioskZoom, 0);
  assert.equal(kioskScale(1200, 1980, 0), 1.5);
  assert.equal(kioskScale(1200, 1980, 1.25), 1.25);
  assert.equal(kioskScale(800, 1280, 2), 2);
  assert.equal(kioskScale(0, 0, 1.75), 1.75);
});

test('stored kiosk zoom values are 0 (automatic) or between 1 and 2', () => {
  for (const v of [undefined, null, '', 'x', 0, 0.5, -1, NaN, {}]) assert.equal(kioskZoom(v), 0);
  assert.equal(kioskZoom(1), 1);
  assert.equal(kioskZoom('1.5'), 1.5);
  assert.equal(kioskZoom(3), 2);
  assert.equal(kioskZoom(1.333), 1.33);
});

test('the screen hint explains a kiosk browser that zooms by its pixel ratio', () => {
  assert.equal(screenHint({ w: 1200, h: 1980, dpr: 1, kioskFits: true }), null);
  assert.match(screenHint({ w: 600, h: 990, dpr: 2, kioskFits: false }), /Zoom von 50 %/);
  assert.match(screenHint({ w: 800, h: 1320, dpr: 1.5, kioskFits: false }) ?? '', /./);
  assert.match(screenHint({ w: 390, h: 844, dpr: 1, kioskFits: false }), /kleiner als/);
});

test('the navigation shell follows screen size and orientation', () => {
  assert.equal(navShell(390, 844), 'bar');
  assert.equal(navShell(767, 1024), 'bar');
  // 10" wall display in portrait format (also with kiosk scaling, media queries use real pixels)
  assert.equal(navShell(1200, 1920), 'dock');
  assert.equal(navShell(768, 1024), 'dock');
  assert.equal(navShell(1280, 800), 'sidebar');
  assert.equal(navShell(1920, 1200), 'sidebar');
});

test('the launcher grid keeps its rows balanced', () => {
  assert.deepEqual([1, 3, 4, 5, 6, 7, 8, 9, 10].map(launcherColumns), [1, 3, 4, 3, 3, 4, 4, 5, 5]);
  assert.equal(launcherColumns(0), 1);
});
