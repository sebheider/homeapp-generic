import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import {
  ExtensionRegistry, SANDBOX_CSP, readPackage, registerExtensionRoutes, safePath, sanitizeExtensionSettings, unzip, validateManifest,
} from '../src/extensions.js';
import { blockForeignWrites, foreignRequest } from '../src/auth.js';
import { zip } from './zip-helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const example = (id) => path.join(root, 'examples', 'modules', id);

const manifest = (extra = {}) => ({
  manifestVersion: 1,
  id: 'pool',
  name: 'Pool',
  version: '1.2.3',
  settings: [
    { key: 'water', type: 'datapoint', label: 'Wasser', required: true },
    { key: 'pump', type: 'datapoint', label: 'Pumpe', write: true },
  ],
  page: { cards: [{ type: 'value', datapoint: 'water', unit: '°C' }, { type: 'switch', datapoint: 'pump' }] },
  ...extra,
});

const tmpDir = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'homeapp-ext-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};

test('a valid manifest is cleaned: unknown fields dropped, defaults filled in', () => {
  const m = validateManifest({ ...manifest(), $schema: 'x', extra: 1 });
  assert.equal(m.icon, 'puzzle');
  assert.equal(m.widget, null);
  assert.equal(m.extra, undefined);
  assert.equal(m.$schema, undefined);
  assert.deepEqual(m.settings[1], { key: 'pump', type: 'datapoint', label: 'Pumpe', description: '', required: false, write: true });
  assert.deepEqual(m.page.cards[0], { type: 'value', label: '', datapoint: 'water', unit: '°C' });
});

test('the example modules follow the schema', () => {
  for (const id of ['pool', 'wallbox']) {
    const dir = example(id);
    const files = new Set(fs.readdirSync(dir));
    const m = validateManifest(JSON.parse(fs.readFileSync(path.join(dir, 'module.json'), 'utf8')), files);
    assert.equal(m.id, id);
  }
});

test('invalid manifests are refused with a message naming the field', () => {
  const cases = [
    [{ manifestVersion: 2 }, /manifestVersion/],
    [{ id: 'Pool!' }, /"id"/],
    [{ id: 'weather' }, /reserviert/],
    [{ version: 'eins' }, /version/],
    [{ homepage: 'javascript:alert(1)' }, /homepage/],
    [{ page: undefined, widget: undefined }, /page.*widget/],
    [{ page: { entry: 'index.html', cards: [] } }, /genau eines/],
    [{ page: { cards: [{ type: 'switch', datapoint: 'water' }] } }, /write/],
    [{ page: { cards: [{ type: 'value', datapoint: 'nope' }] } }, /keine Einstellung/],
    [{ page: { cards: [{ type: 'slider', datapoint: 'pump', min: 5, max: 5 }] } }, /min/],
    [{ page: { entry: '../evil.html' } }, /relativer Dateipfad/],
    [{ page: { entry: 'app.js' } }, /\.html/],
    [{ settings: [{ key: 'a', type: 'select', label: 'A', options: [{ value: 'x', label: 'X' }], default: 'y' }] }, /default/],
    [{ settings: [{ key: 'a', type: 'text', label: 'A' }, { key: 'a', type: 'text', label: 'B' }] }, /doppelt/],
    [{ widget: { cards: [{ type: 'text', text: 'x' }], size: [13, 2] } }, /widget.size/],
  ];
  for (const [patch, message] of cases) assert.throws(() => validateManifest(manifest(patch)), message, JSON.stringify(patch));
  assert.throws(() => validateManifest(manifest({ page: { entry: 'index.html' } }), new Set(['module.json'])), /fehlt im Paket/);
});

test('stored settings fall back to the defaults of the manifest', () => {
  const m = validateManifest(manifest({
    settings: [
      { key: 'dp', type: 'datapoint', label: 'Dp' },
      { key: 'n', type: 'number', label: 'N', min: 0, max: 10, default: 5 },
      { key: 's', type: 'select', label: 'S', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
      { key: 'b', type: 'boolean', label: 'B', default: true },
      { key: 't', type: 'text', label: 'T', default: 'Hallo' },
    ],
    page: { cards: [{ type: 'text', text: 'x' }] },
  }));
  assert.deepEqual(sanitizeExtensionSettings(m, { dp: ' a.b ', n: 99, s: 'zz', b: 'yes', t: 3, other: 1 }), { dp: 'a.b', n: 10, s: 'a', b: true, t: 'Hallo' });
  assert.deepEqual(sanitizeExtensionSettings(m, { n: '3', s: 'b', b: false, t: 'x' }), { dp: '', n: 3, s: 'b', b: false, t: 'x' });
});

test('package paths: only relative paths without parent references', () => {
  assert.equal(safePath('assets\\app.js'), 'assets/app.js');
  assert.equal(safePath('./index.html'), 'index.html');
  for (const bad of ['../x.html', '/etc/passwd', 'C:/x.html', 'a/../../b.html', '.hidden', 'a b.html', '']) assert.equal(safePath(bad), null, bad);
});

test('ZIP packages: deflated and stored entries, folder stripped, hostile entries refused', () => {
  const files = unzip(zip({ 'a.txt': 'hallo', 'sub/b.txt': 'welt' }));
  assert.equal(files.get('sub/b.txt').toString(), 'welt');
  assert.equal(unzip(zip({ 'a.txt': 'x' }, { method: 0 })).get('a.txt').toString(), 'x');
  assert.throws(() => unzip(zip({ '../evil.html': 'x' })), /Unzulässiger Dateiname/);
  assert.throws(() => unzip(zip({ 'a.txt': 'x' }).subarray(0, 40)), /beschädigt/);
  const many = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`f${i}.txt`, 'x']));
  assert.throws(() => unzip(zip(many), { maxFiles: 3 }), /zu viele/);
  assert.throws(() => unzip(zip({ 'a.txt': 'x'.repeat(2000) }), { maxBytes: 1000 }), /größer/);
  // hidden files and macOS metadata are skipped
  assert.deepEqual([...unzip(zip({ '.DS_Store': 'x', '__MACOSX/._a': 'x', 'a.txt': 'x' })).keys()], ['a.txt']);

  const nested = readPackage(zip({ 'pool/module.json': JSON.stringify(manifest()), 'pool/readme.md': '#' }));
  assert.deepEqual([...nested.files.keys()].sort(), ['module.json', 'readme.md']);
  assert.throws(() => readPackage(zip({ 'module.json': JSON.stringify(manifest()), 'run.sh': 'rm -rf /' })), /Dateityp nicht erlaubt/);
  assert.throws(() => readPackage(zip({ 'readme.md': 'x' })), /module.json fehlt/);
  assert.throws(() => readPackage(Buffer.from('kein json')), /weder ein ZIP-Paket/);
  assert.equal(readPackage(Buffer.from(JSON.stringify(manifest()))).manifest.id, 'pool');
});

test('registry: install, update, list, files, settings, remove', (t) => {
  const dir = tmpDir(t);
  const reg = new ExtensionRegistry({ dir }).load();
  const pkg = (version) => zip({
    'module.json': JSON.stringify(manifest({ version, widget: { entry: 'index.html' } })),
    'index.html': '<p>Pool</p>',
    'img/logo.svg': '<svg/>',
  });
  assert.deepEqual(reg.install(pkg('1.0.0')), { manifest: reg.get('pool'), previousVersion: null });
  assert.equal(reg.install(pkg('1.1.0')).previousVersion, '1.0.0');
  assert.equal(reg.get('pool').version, '1.1.0');
  assert.deepEqual(fs.readdirSync(dir), ['pool']); // no temporary folders left
  assert.equal(reg.asset('pool', 'img/logo.svg').type, 'image/svg+xml');
  assert.equal(reg.asset('pool', '../pool/module.json'), null);
  assert.equal(reg.asset('pool', 'missing.html'), null);
  assert.equal(reg.asset('other', 'index.html'), null);

  // a broken package (copied by hand) is listed with its error and keeps its stored settings
  fs.mkdirSync(path.join(dir, 'broken'));
  fs.writeFileSync(path.join(dir, 'broken', 'module.json'), '{"manifestVersion": 1, "id": "other"');
  fs.mkdirSync(path.join(dir, '.tmp-left-over'));
  reg.load();
  assert.equal(fs.existsSync(path.join(dir, '.tmp-left-over')), false);
  const broken = reg.list().find((i) => i.id === 'broken');
  assert.equal(broken.manifest, null);
  assert.match(broken.error, /JSON/);
  assert.deepEqual(reg.manifests().map((m) => m.id), ['pool']);

  const stored = reg.sanitizeConfig(
    { pool: { enabled: true, settings: { water: 'pool.temp', pump: 'pool.pump', x: 1 } }, gone: { enabled: true } },
    { broken: { enabled: true, settings: { a: 1 } } },
  );
  assert.deepEqual(stored, { pool: { enabled: true, settings: { water: 'pool.temp', pump: 'pool.pump' } }, broken: { enabled: true, settings: { a: 1 } } });
  assert.deepEqual(reg.effectiveConfig(stored), { pool: stored.pool });
  assert.deepEqual(reg.stateIds(stored), ['pool.temp', 'pool.pump']);
  assert.deepEqual(reg.stateIds({ pool: { ...stored.pool, enabled: false } }), []);
  assert.deepEqual(reg.sanitizeConfig({}).pool, { enabled: false, settings: { water: '', pump: '' } });

  assert.equal(reg.remove('pool'), true);
  assert.equal(reg.remove('pool'), false);
  assert.equal(fs.existsSync(path.join(dir, 'pool')), false);
});

test('a failed installation keeps the installed version', (t) => {
  const dir = tmpDir(t);
  const reg = new ExtensionRegistry({ dir }).load();
  reg.install(Buffer.from(JSON.stringify(manifest())));
  assert.throws(() => reg.install(zip({ 'module.json': JSON.stringify(manifest({ version: '2.0.0', page: { entry: 'missing.html' } })) })), /fehlt im Paket/);
  assert.equal(reg.get('pool').version, '1.2.3');
  assert.equal(new ExtensionRegistry({ dir }).load().get('pool').version, '1.2.3');
});

test('HTTP: upload, list, sandboxed files, removal; foreign writes are refused', async (t) => {
  const dir = tmpDir(t);
  const reg = new ExtensionRegistry({ dir }).load();
  let changes = 0;
  const app = express();
  app.use(express.json());
  app.use(blockForeignWrites);
  registerExtensionRoutes(app, { registry: reg, onChange: () => changes++ });
  app.post('/api/state', (_req, res) => res.json({ ok: true }));
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const wallbox = example('wallbox');
  const pkg = zip(Object.fromEntries(fs.readdirSync(wallbox).map((f) => [`wallbox/${f}`, fs.readFileSync(path.join(wallbox, f))])));
  const up = await fetch(`${base}/api/extensions`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: pkg });
  assert.equal(up.status, 200);
  assert.equal((await up.json()).manifest.id, 'wallbox');
  assert.equal(changes, 1);

  // a module.json sent as JSON works as well
  const json = await fetch(`${base}/api/extensions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: fs.readFileSync(path.join(example('pool'), 'module.json')) });
  assert.equal(json.status, 200);

  const bad = await fetch(`${base}/api/extensions`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: zip({ 'module.json': '{}' }) });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /manifestVersion/);
  const huge = await fetch(`${base}/api/extensions`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: Buffer.alloc(5 * 1024 * 1024 + 10) });
  assert.equal(huge.status, 413);
  assert.match((await huge.json()).error, /größer/);

  const list = await (await fetch(`${base}/api/extensions`)).json();
  assert.deepEqual(list.extensions.map((i) => i.id), ['pool', 'wallbox']);

  const page = await fetch(`${base}/extensions/wallbox/index.html`);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('content-security-policy'), SANDBOX_CSP);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await fetch(`${base}/extensions/wallbox/..%2Fpool%2Fmodule.json`)).status, 404);
  assert.equal((await fetch(`${base}/extensions/wallbox/missing.js`)).status, 404);

  // pages of modules (origin "null") and other web sites must not change anything
  const write = (headers) => fetch(`${base}/api/state`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{}' });
  assert.equal((await write({ origin: 'null' })).status, 403);
  assert.equal((await write({ 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await write({ 'sec-fetch-site': 'same-origin' })).status, 200);
  assert.equal((await fetch(`${base}/api/extensions`, { headers: { origin: 'null' } })).status, 200);
  assert.equal(foreignRequest({ origin: 'https://homeapp.local' }), false);

  assert.equal((await fetch(`${base}/api/extensions/wallbox`, { method: 'DELETE' })).status, 200);
  assert.equal((await fetch(`${base}/api/extensions/wallbox`, { method: 'DELETE' })).status, 404);
  assert.equal((await fetch(`${base}/extensions/wallbox/index.html`)).status, 404);
  assert.equal(changes, 3);
});
