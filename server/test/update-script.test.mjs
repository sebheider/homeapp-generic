/**
 * Test des Update-Skripts aus dem README (Variante C, DSM-Aufgabenplaner).
 *
 * Das Skript wird direkt aus dem README gelesen und mit einem simulierten `docker` ausgeführt,
 * so bleibt die Anleitung dauerhaft lauffähig. Geprüft wird vor allem:
 *   - nichts Globales: die Anmeldung geschieht in einem temporären Ordner, der danach gelöscht ist
 *   - der Container wird nur bei einem wirklich neuen Image ersetzt und nur, wenn er schon existiert
 *   - Windows-Zeilenenden in der .env stören nicht
 *   - gleiche Fehlermeldungen füllen das Log nicht alle 5 Minuten neu
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const readme = fs.readFileSync(path.join(here, '..', '..', 'README.md'), 'utf8').replace(/\r\n/g, '\n');
const SH = [process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\sh.exe' : '/bin/sh', 'C:\\Program Files (x86)\\Git\\bin\\sh.exe'].find((p) => fs.existsSync(p));
const posix = (p) => p.replace(/\\/g, '/');
const skip = SH ? false : 'keine POSIX-Shell gefunden';

/** Liest den Codeblock mit dem Update-Skript aus dem README. */
function extractScript() {
  const lines = readme.split('\n');
  const start = lines.findIndex((l, i) => /^\s*```sh\s*$/.test(l) && /^\s*cd \/volume1\/docker\/HomeApp/.test(lines[i + 1] ?? ''));
  assert.ok(start >= 0, 'Update-Skript im README nicht gefunden');
  const indent = lines[start].match(/^\s*/)[0].length;
  const body = [];
  for (let i = start + 1; i < lines.length && !/^\s*```\s*$/.test(lines[i]); i++) body.push(lines[i].slice(indent));
  return body.join('\n') + '\n';
}

// Simuliertes docker: protokolliert jeden Aufruf; Zustand liegt in Dateien ($FAKE_DIR)
const FAKE_DOCKER = `#!/bin/sh
D="$FAKE_DIR"
echo "$*" >> "$D/calls"
case "$1" in
  login)
    cat > "$D/stdin"
    echo "login-user=$4 cfg-ok=$([ -d "$DOCKER_CONFIG" ] && echo yes || echo no)" >> "$D/calls"
    [ -f "$D/LOGINFAIL" ] && exit 1
    exit 0 ;;
  pull)
    echo "$DOCKER_CONFIG" > "$D/cfgdir"
    [ -f "$D/PULLFAIL" ] && exit 1
    if [ -f "$D/NEWIMAGE" ]; then echo "sha256:0123456789abcdef0123" > "$D/imageid"; rm "$D/NEWIMAGE"; fi
    exit 0 ;;
  image)
    if [ -f "$D/cfgdir" ] && [ -d "$(cat "$D/cfgdir")" ]; then echo CFG_LEFT >> "$D/calls"; fi
    cat "$D/imageid" 2>/dev/null
    exit 0 ;;
  container) [ -f "$D/CONTAINER" ]; exit $? ;;
esac
exit 0
`;

const OLD_ID = 'sha256:aaaaaaaaaaaa00000000';

function run({ env = 'GHCR_USER=homeapp\nGHCR_TOKEN=ghp_test123\n', newImage = false, container = true, pullFail = false, loginFail = false, repeat = 1 } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'homeapp-upd-'));
  const work = path.join(root, 'work');
  const bin = path.join(root, 'bin');
  const fake = path.join(root, 'fake');
  [work, bin, fake].forEach((d) => fs.mkdirSync(d));
  fs.writeFileSync(path.join(bin, 'docker'), FAKE_DOCKER, { mode: 0o755 });
  if (env !== null) fs.writeFileSync(path.join(work, '.env'), env);
  fs.writeFileSync(path.join(fake, 'imageid'), OLD_ID + '\n');
  const flag = (name, on) => on && fs.writeFileSync(path.join(fake, name), '');
  flag('NEWIMAGE', newImage);
  flag('CONTAINER', container);
  flag('PULLFAIL', pullFail);
  flag('LOGINFAIL', loginFail);

  const scriptFile = path.join(root, 'update.sh');
  fs.writeFileSync(scriptFile, extractScript().replaceAll('/volume1/docker/HomeApp', posix(work)));

  const env2 = { ...process.env, FAKE_DIR: posix(fake) };
  const pathKey = Object.keys(env2).find((k) => k.toLowerCase() === 'path') || 'PATH';
  const gitUsr = path.join(path.dirname(SH), '..', 'usr', 'bin');
  env2[pathKey] = [bin, fs.existsSync(gitUsr) ? gitUsr : '', env2[pathKey]].filter(Boolean).join(path.delimiter);

  let last;
  for (let i = 0; i < repeat; i++) last = spawnSync(SH, [scriptFile], { env: env2, encoding: 'utf8' });
  const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');
  const result = {
    status: last.status,
    stderr: last.stderr,
    calls: read(path.join(fake, 'calls')).split('\n').filter(Boolean),
    log: read(path.join(work, 'update.log')),
    stdin: read(path.join(fake, 'stdin')).trim(),
  };
  fs.rmSync(root, { recursive: true, force: true });
  assert.ok(!result.calls.includes('CFG_LEFT'), 'der temporäre Anmeldeordner wurde nicht gelöscht');
  return result;
}

test('Skript hat gültige Syntax', { skip }, () => {
  const file = path.join(os.tmpdir(), `homeapp-syntax-${process.pid}.sh`);
  fs.writeFileSync(file, extractScript());
  const r = spawnSync(SH, ['-n', file], { encoding: 'utf8' });
  fs.rmSync(file, { force: true });
  assert.equal(r.status, 0, r.stderr);
});

test('kein neues Image: Anmeldung nur temporär, Container bleibt unberührt, kein Log', { skip }, () => {
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.calls.includes('login-user=homeapp cfg-ok=yes'), 'Anmeldung mit Benutzer aus .env, in vorhandenem temporären Ordner');
  assert.equal(r.stdin, 'ghp_test123', 'Token kommt über stdin, nicht als Argument');
  assert.ok(!r.calls.some((c) => c.includes('ghp_test123')), 'Token darf in keinem Aufruf als Argument stehen');
  assert.ok(r.calls.includes('pull -q ghcr.io/sebheider/homeapp-generic:latest'));
  assert.ok(!r.calls.some((c) => c.startsWith('compose -p')), 'kein Neustart ohne neues Image');
  assert.equal(r.log, '');
});

test('neues Image und Container vorhanden: Container ersetzt, nur altes HomeApp-Image entfernt', { skip }, () => {
  const r = run({ newImage: true });
  assert.ok(r.calls.includes('compose -p homeapp up -d'));
  assert.ok(r.calls.includes(`rmi ${OLD_ID}`));
  assert.ok(!r.calls.some((c) => c.includes('prune')), 'kein globales Aufräumen fremder Images');
  assert.match(r.log, /HomeApp aktualisiert \(0123456789ab\)/);
});

test('neues Image, Container fehlt: nur Image laden und Hinweis, kein Start', { skip }, () => {
  const r = run({ newImage: true, container: false });
  assert.ok(!r.calls.some((c) => c.startsWith('compose -p')));
  assert.match(r.log, /Projekt im Container Manager/);
});

test('ohne Token (öffentliches Package): keine Anmeldung', { skip }, () => {
  const r = run({ env: 'HOMEAPP_IMAGE=ghcr.io/x/y:latest\n' });
  assert.ok(!r.calls.some((c) => c.startsWith('login')));
  assert.ok(r.calls.includes('pull -q ghcr.io/x/y:latest'), 'Image aus .env');
});

test('ohne .env: Standard-Image, keine Anmeldung', { skip }, () => {
  const r = run({ env: null });
  assert.ok(!r.calls.some((c) => c.startsWith('login')));
  assert.ok(r.calls.includes('pull -q ghcr.io/sebheider/homeapp-generic:latest'));
});

test('.env mit Windows-Zeilenenden (CRLF)', { skip }, () => {
  const r = run({ env: 'GHCR_USER=homeapp\r\nGHCR_TOKEN=tok123\r\nHOMEAPP_IMAGE=ghcr.io/a/b:v1\r\n' });
  assert.ok(r.calls.includes('login-user=homeapp cfg-ok=yes'), 'Benutzer ohne Zeilenumbruch-Rest');
  assert.equal(r.stdin, 'tok123');
  assert.ok(r.calls.includes('pull -q ghcr.io/a/b:v1'));
});

test('gleicher Ladefehler mehrfach hintereinander erscheint nur einmal im Log', { skip }, () => {
  const r = run({ pullFail: true, repeat: 3 });
  assert.equal(r.log.split('\n').filter((l) => l.includes('Image konnte nicht geladen werden')).length, 1);
});

test('fehlgeschlagene Anmeldung wird gemeldet, das Skript läuft weiter', { skip }, () => {
  const r = run({ loginFail: true });
  assert.match(r.log, /Anmeldung bei ghcr\.io fehlgeschlagen/);
  assert.ok(r.calls.some((c) => c.startsWith('pull')));
});
