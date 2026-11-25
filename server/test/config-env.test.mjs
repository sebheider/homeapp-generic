// Precedence of environment variables vs. manually saved settings:
// the environment only provides defaults, what was set by hand always wins.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'homeapp-cfg-'));
process.env.DATA_DIR = dir;
const { ConfigStore, envSources, refreshSeconds } = await import('../src/config.js');
const file = path.join(dir, 'config.json');

const ENV_KEYS = ['IOBROKER_HOST', 'IOBROKER_PORT', 'IOBROKER_USER', 'IOBROKER_PASSWORD', 'IOBROKER_MODE', 'DEMO_MODE', 'SS_HOST', 'SS_PORT', 'SS_HTTPS', 'SS_PASSWORD'];
const setEnv = (o) => {
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, o);
};
const editor = (store) => structuredClone(store.editableConfig());

beforeEach(() => {
  setEnv({});
  fs.rmSync(file, { force: true });
});

test('empty variables count as not set', () => {
  setEnv({ IOBROKER_HOST: '', SS_HOST: ' ' });
  assert.equal(envSources().size, 0);
});

test('a host variable implies live mode and Surveillance Station', () => {
  setEnv({ IOBROKER_HOST: '10.0.0.1', SS_HOST: '10.0.0.2' });
  const s = envSources();
  assert.equal(s.get('iobroker.mode').value, 'socketio');
  assert.equal(s.get('surveillance.enabled').value, true);
});

test('fresh install: environment values are the defaults', () => {
  setEnv({ IOBROKER_HOST: '10.0.0.1', IOBROKER_PORT: '8081', SS_HTTPS: '1' });
  const store = new ConfigStore();
  assert.equal(store.effective.iobroker.host, '10.0.0.1');
  assert.equal(store.effective.iobroker.port, 8081);
  assert.equal(store.effective.surveillance.https, true);
  assert.equal(editor(store).iobroker.host, '10.0.0.1');
});

test('manually saved values win over the environment', () => {
  setEnv({ IOBROKER_HOST: '192.168.1.10', IOBROKER_PORT: '9999' });
  const store = new ConfigStore();
  const cfg = editor(store);
  cfg.iobroker.host = '192.168.178.10';
  store.update(cfg);
  assert.equal(store.effective.iobroker.host, '192.168.178.10');
  // port was not touched: still follows the environment
  assert.equal(store.effective.iobroker.port, 9999);
  // survives a restart
  const again = new ConfigStore();
  assert.equal(again.effective.iobroker.host, '192.168.178.10');
  assert.equal(again.effective.iobroker.port, 9999);
});

test('saving unrelated settings does not freeze environment defaults', () => {
  setEnv({ IOBROKER_HOST: '10.0.0.1' });
  const store = new ConfigStore();
  const cfg = editor(store);
  cfg.app.name = 'Mein Haus';
  store.update(cfg);
  setEnv({ IOBROKER_HOST: '10.0.0.99' });
  assert.equal(store.effective.iobroker.host, '10.0.0.99');
  assert.equal(store.effective.app.name, 'Mein Haus');
});

test('legacy config.json: values that differ from the defaults count as manual', () => {
  fs.writeFileSync(file, JSON.stringify({ iobroker: { mode: 'socketio', host: '192.168.178.10', port: 8082 }, surveillance: { enabled: true, host: '192.168.178.10', port: 50010, https: true } }));
  setEnv({ IOBROKER_HOST: '192.168.1.10', SS_HOST: '192.168.1.5', SS_PORT: '5000', SS_HTTPS: '0' });
  const store = new ConfigStore();
  assert.equal(store.effective.iobroker.host, '192.168.178.10');
  assert.equal(store.effective.iobroker.port, 8082);
  assert.equal(store.effective.surveillance.host, '192.168.178.10');
  assert.equal(store.effective.surveillance.port, 50010);
  assert.equal(store.effective.surveillance.https, true);
  assert.ok(JSON.parse(fs.readFileSync(file, 'utf8')).userSet.includes('surveillance.port'));
});

test('resetEnv hands a field back to the environment', () => {
  setEnv({ IOBROKER_PORT: '8081' });
  const store = new ConfigStore();
  const cfg = editor(store);
  cfg.iobroker.port = 8082;
  store.update(cfg);
  assert.equal(store.effective.iobroker.port, 8082);
  assert.equal(store.envInfo().find((x) => x.field === 'iobroker.port').manual, true);
  store.update({ ...editor(store), resetEnv: ['iobroker.port'] });
  assert.equal(store.effective.iobroker.port, 8081);
  assert.equal(store.envInfo().find((x) => x.field === 'iobroker.port').manual, false);
});

test('secrets: stored value wins, otherwise the environment; never sent to the browser', () => {
  setEnv({ IOBROKER_PASSWORD: 'from-env' });
  const store = new ConfigStore();
  assert.equal(store.effective.iobroker.password, 'from-env');
  assert.equal(editor(store).iobroker.password, undefined);
  assert.equal(editor(store).iobroker.passwordSet, true);
  const cfg = editor(store);
  cfg.iobroker.password = 'typed';
  store.update(cfg);
  assert.equal(store.effective.iobroker.password, 'typed');
  assert.ok(!JSON.stringify(store.envInfo()).includes('from-env'));
});

test('unchanged account does not reset the device token', () => {
  setEnv({ SS_HOST: 'x' });
  const store = new ConfigStore();
  store.setDeviceId('token');
  const cfg = editor(store);
  cfg.surveillance.account = 'homeapp';
  store.update(cfg);
  assert.equal(store.raw.surveillance.deviceId, '');
  store.setDeviceId('token');
  store.update(editor(store));
  assert.equal(store.raw.surveillance.deviceId, 'token');
});

test('pop-up options, notifications and page layouts are cleaned on save; alerts are subscribed', () => {
  const store = new ConfigStore();
  assert.equal(store.raw.app.popupPosition, 'center');
  assert.equal(store.raw.app.popupSize, 'large');
  assert.ok(store.effective.alerts.length > 0, 'demo mode shows sample notifications');
  const cfg = editor(store);
  cfg.app.popupPosition = 'somewhere';
  cfg.app.popupSize = 'full';
  cfg.alerts = [{ name: 'Frost', state: 'demo.0.custom.temp', op: '<', value: '3' }];
  cfg.layouts = { lights: { groupBy: 'none' } };
  store.update(cfg);
  assert.equal(store.raw.app.popupPosition, 'center');
  assert.equal(store.raw.app.popupSize, 'full');
  assert.equal(store.raw.alerts[0].value, 3);
  assert.equal(store.raw.layouts.lights.groupBy, 'none');
  assert.equal(store.raw.layouts.climate.groupBy, 'default');
  assert.equal(store.effective.alerts.length, 1, 'own notifications replace the samples');
  assert.ok(store.stateIds().has('demo.0.custom.temp'));
});

test('camera refresh rates for the app and the pop-up are separate, with defaults and limits', () => {
  const store = new ConfigStore();
  assert.equal(store.raw.app.snapshotRefreshSeconds, 3);
  assert.equal(store.raw.app.popupSnapshotRefreshSeconds, 1);
  assert.equal(store.publicConfig().app.popupSnapshotRefreshSeconds, 1);
  const cfg = editor(store);
  cfg.app.snapshotRefreshSeconds = 10;
  cfg.app.popupSnapshotRefreshSeconds = 2;
  store.update(cfg);
  assert.equal(store.raw.app.snapshotRefreshSeconds, 10);
  assert.equal(store.raw.app.popupSnapshotRefreshSeconds, 2);
  const bad = editor(store);
  bad.app.snapshotRefreshSeconds = 0;
  delete bad.app.popupSnapshotRefreshSeconds;
  store.update(bad);
  assert.equal(store.raw.app.snapshotRefreshSeconds, 0.5);
  assert.equal(store.raw.app.popupSnapshotRefreshSeconds, 1, 'missing value falls back to the default');
  assert.equal(refreshSeconds('abc', 1), 1);
  assert.equal(refreshSeconds(null, 3), 3);
  assert.equal(refreshSeconds(9999, 3), 300);
});

test('config files without the pop-up refresh rate keep the previous behaviour', () => {
  fs.writeFileSync(file, JSON.stringify({ app: { name: 'Alt', snapshotRefreshSeconds: 5 } }));
  const store = new ConfigStore();
  assert.equal(store.raw.app.snapshotRefreshSeconds, 5);
  assert.equal(store.raw.app.popupSnapshotRefreshSeconds, 1);
  assert.equal(store.raw.app.popupLiveVideo, true, 'live video is on for existing installations');
});

test('the live video of the pop-up can be switched off', () => {
  const store = new ConfigStore();
  assert.equal(store.publicConfig().app.popupLiveVideo, true);
  const cfg = editor(store);
  cfg.app.popupLiveVideo = false;
  store.update(cfg);
  assert.equal(store.raw.app.popupLiveVideo, false);
  const missing = editor(store);
  delete missing.app.popupLiveVideo;
  store.update(missing);
  assert.equal(store.raw.app.popupLiveVideo, true);
});

test('effective configuration is cached until the file or the environment changes', () => {
  setEnv({ IOBROKER_HOST: '10.0.0.1' });
  const store = new ConfigStore();
  assert.equal(store.effective, store.effective, 'repeated reads share one object');
  assert.equal(store.stateIds(), store.stateIds());
  const before = store.effective;
  const cfg = editor(store);
  cfg.app.name = 'Neu';
  store.update(cfg);
  assert.notEqual(store.effective, before, 'saving rebuilds it');
  assert.equal(store.effective.app.name, 'Neu');
  const saved = store.effective;
  store.setDeviceId('token');
  assert.notEqual(store.effective, saved, 'a new device token rebuilds it');
  setEnv({ IOBROKER_HOST: '10.0.0.2' });
  assert.equal(store.effective.iobroker.host, '10.0.0.2', 'environment changes are picked up');
});

test('the custom start page is saved on its own and kept when the settings are saved', () => {
  const store = new ConfigStore();
  assert.deepEqual(store.raw.customDashboard, { widgets: [] });
  let pushed = null;
  store.on('dashboard', (d) => (pushed = d));
  let restarted = false;
  store.on('change', () => (restarted = true));
  const saved = store.setDashboard({ widgets: [{ id: 'a', type: 'clock', x: 0, y: 0, w: 4, h: 3 }, { type: 'evil' }] });
  assert.deepEqual(saved.widgets.map((w) => w.id), ['a']);
  assert.equal(pushed, saved);
  assert.equal(restarted, false, 'saving the start page does not restart the integrations');
  assert.equal(store.publicConfig().customDashboard.widgets.length, 1);
  // a settings page opened before the start page was designed sends the old (empty) start page
  const cfg = editor(store);
  cfg.customDashboard = { widgets: [] };
  store.update(cfg);
  assert.equal(store.raw.customDashboard.widgets.length, 1);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).customDashboard.widgets[0].type, 'clock');
});

test('OctoPrint: the API key is write-only, kept when not sent and the section is cleaned', () => {
  const store = new ConfigStore();
  assert.equal(store.raw.octoprint.enabled, false);
  assert.equal(editor(store).octoprint.apiKeySet, false);
  const cfg = editor(store);
  cfg.octoprint = { ...cfg.octoprint, enabled: true, host: 'http://192.168.178.15/', apiKey: 'SECRET', popupMinutes: 0 };
  store.update(cfg);
  assert.equal(store.raw.octoprint.apiKey, 'SECRET');
  assert.equal(store.raw.octoprint.host, '192.168.178.15');
  assert.equal(store.raw.octoprint.popupMinutes, 1);
  for (const view of [store.editableConfig(), store.publicConfig()]) {
    assert.equal(view.octoprint.apiKey, undefined, 'never sent to the browser');
    assert.equal(view.octoprint.apiKeySet, true);
  }
  // the editor sends the masked config back: the key stays
  const again = editor(store);
  again.octoprint.popupMinutes = 30;
  store.update(again);
  assert.equal(store.raw.octoprint.apiKey, 'SECRET');
  assert.equal(store.raw.octoprint.popupMinutes, 30);
  assert.equal('apiKeySet' in store.raw.octoprint, false);
  const replaced = editor(store);
  replaced.octoprint.apiKey = 'NEW';
  store.update(replaced);
  assert.equal(store.raw.octoprint.apiKey, 'NEW');
  // a config file from before the printer existed gets the defaults
  fs.writeFileSync(file, JSON.stringify({ app: { name: 'Alt' } }));
  assert.equal(new ConfigStore().raw.octoprint.popupMinutes, 15);
});

test('Pushover: user key and token are write-only and kept when not sent', () => {
  const store = new ConfigStore();
  const cfg = editor(store);
  cfg.pushover = { ...cfg.pushover, enabled: true, user: 'USERKEY', token: 'APPTOKEN' };
  store.update(cfg);
  for (const view of [store.editableConfig(), store.publicConfig()]) {
    assert.equal(view.pushover.user, undefined, 'never sent to the browser');
    assert.equal(view.pushover.token, undefined);
    assert.equal(view.pushover.userSet && view.pushover.tokenSet, true);
  }
  const again = editor(store);
  again.pushover.events.motion.enabled = true;
  store.update(again);
  assert.deepEqual([store.raw.pushover.user, store.raw.pushover.token, store.raw.pushover.events.motion.enabled], ['USERKEY', 'APPTOKEN', true]);
  assert.equal('userSet' in store.raw.pushover, false);
});

test('Bambu Lab: the access code is write-only and kept when not sent', () => {
  const store = new ConfigStore();
  assert.equal(store.raw.bambu.camera, 'auto');
  const cfg = editor(store);
  cfg.octoprint = { ...cfg.octoprint, enabled: true, type: 'bambu' };
  cfg.bambu = { ...cfg.bambu, host: '192.168.178.20', serial: '01p00a123', accessCode: 'CODE1234' };
  store.update(cfg);
  assert.equal(store.raw.octoprint.type, 'bambu');
  assert.equal(store.raw.bambu.serial, '01P00A123');
  assert.equal(store.raw.bambu.accessCode, 'CODE1234');
  const view = store.editableConfig();
  assert.equal(view.bambu.accessCode, undefined, 'never sent to the browser');
  assert.equal(view.bambu.accessCodeSet, true);
  const again = editor(store);
  again.bambu.camera = 'off';
  store.update(again);
  assert.equal(store.raw.bambu.accessCode, 'CODE1234');
  assert.equal(store.raw.bambu.camera, 'off');
  assert.equal('accessCodeSet' in store.raw.bambu, false);
});

test('Spotify: the login is stored by the login only, never sent to the browser and dropped with another client id', () => {
  const store = new ConfigStore();
  assert.equal(store.raw.spotify.enabled, false);
  const cfg = editor(store);
  cfg.spotify = { ...cfg.spotify, enabled: true, clientId: 'cid', refreshToken: 'FROM-BROWSER', account: 'Fake' };
  store.update(cfg);
  assert.equal(store.raw.spotify.refreshToken, '', 'the browser can not set the token');
  assert.equal(store.raw.spotify.account, '');
  store.setSpotifyAuth({ refreshToken: 'RT', account: 'Alex' });
  assert.equal(new ConfigStore().raw.spotify.refreshToken, 'RT', 'persisted');
  for (const view of [store.editableConfig(), store.publicConfig()]) {
    assert.equal(view.spotify.refreshToken, undefined);
    assert.equal(view.spotify.connected, true);
    assert.equal(view.spotify.account, 'Alex');
  }
  assert.equal(store.effective.spotify.refreshToken, 'RT');
  const again = editor(store);
  again.spotify.device = 'AV-Receiver';
  store.update(again);
  assert.equal(store.raw.spotify.refreshToken, 'RT', 'kept when other settings are saved');
  assert.equal(store.raw.spotify.device, 'AV-Receiver');
  store.setSpotifyAuth({ refreshToken: 'RT2' });
  assert.equal(store.raw.spotify.account, 'Alex', 'null keeps the account');
  const other = editor(store);
  other.spotify.clientId = 'other';
  store.update(other);
  assert.equal(store.raw.spotify.refreshToken, '');
  assert.equal(store.raw.spotify.account, '');
});
