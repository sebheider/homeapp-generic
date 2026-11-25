// Shared MJPEG streams: splitting multipart streams into frames and distributing one upstream to many viewers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { PassThrough } from 'node:stream';
import { BOUNDARY, MjpegHub, MjpegParser, boundaryOf } from '../src/mjpeg.js';

const jpeg = (n) => Buffer.from([0xff, 0xd8, n, 0x2d, 0x0d, 0x0a, n, 0xff, 0xd9]);

test('boundaryOf reads quoted and dashed boundaries', () => {
  assert.equal(boundaryOf('multipart/x-mixed-replace; boundary=myboundary'), 'myboundary');
  assert.equal(boundaryOf('multipart/x-mixed-replace;boundary="--frame"'), 'frame');
  assert.equal(boundaryOf('multipart/x-mixed-replace; boundary=--BoundaryString; charset=x'), 'BoundaryString');
  assert.equal(boundaryOf('image/jpeg'), null);
});

test('MjpegParser splits frames with and without Content-Length across chunk borders', () => {
  const frames = [];
  const parser = new MjpegParser('frame', (f) => frames.push(f));
  // mjpg-streamer style (Content-Length) followed by a part without length (Synology style)
  const data = Buffer.concat([
    Buffer.from('--frame\r\nContent-Type: image/jpeg\r\nContent-Length: 9\r\n\r\n'), jpeg(1), Buffer.from('\r\n'),
    Buffer.from('--frame\r\nContent-Type: image/jpeg\r\n\r\n'), jpeg(2), Buffer.from('\r\n'),
    Buffer.from('--frame\r\n'),
  ]);
  for (let i = 0; i < data.length; i += 5) parser.push(data.subarray(i, i + 5));
  assert.equal(frames.length, 2);
  assert.deepEqual(frames[0].body, jpeg(1));
  assert.deepEqual(frames[1].body, jpeg(2));
  assert.equal(frames[1].type, 'image/jpeg');
});

test('MjpegParser skips leading garbage and accepts LF-only headers', () => {
  const frames = [];
  const parser = new MjpegParser('b', (f) => frames.push(f));
  parser.push(Buffer.concat([Buffer.from('xx--b\nContent-Length: 9\n\n'), jpeg(7), Buffer.from('\n--b\n')]));
  assert.equal(frames.length, 1);
  assert.deepEqual(frames[0].body, jpeg(7));
});

/** Fake camera: an MJPEG server whose frames are pushed by the test. */
async function fakeCamera(t) {
  const conns = new Set();
  let opened = 0;
  const server = http.createServer((_req, res) => {
    opened++;
    res.writeHead(200, { 'Content-Type': 'multipart/x-mixed-replace; boundary=cam' });
    res.flushHeaders();
    conns.add(res);
    res.on('close', () => conns.delete(res));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const url = `http://127.0.0.1:${server.address().port}/`;
  return {
    get opened() { return opened; },
    get open() { return conns.size; },
    drop: () => conns.forEach((res) => res.destroy()),
    send: (n) => conns.forEach((res) => res.write(Buffer.concat([Buffer.from(`--cam\r\nContent-Type: image/jpeg\r\nContent-Length: 9\r\n\r\n`), jpeg(n), Buffer.from('\r\n')]))),
    connect: () => new Promise((resolve, reject) => http.get(url, resolve).on('error', reject)),
  };
}

/** App that serves the shared stream at /stream. */
async function hubServer(t, hub, open) {
  const server = http.createServer(async (req, res) => {
    try {
      await hub.attach('cam', open, req, res);
    } catch (err) {
      res.writeHead(502).end(err.message);
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => {
    hub.closeAll();
    server.closeAllConnections();
    server.close();
  });
  return `http://127.0.0.1:${server.address().port}/stream`;
}

/** Opens a viewer and collects the frames it receives. */
function viewer(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const frames = [];
      const parser = new MjpegParser(boundaryOf(res.headers['content-type']) || 'none', (f) => frames.push(f.body[2]));
      res.on('data', (c) => parser.push(c));
      resolve({ res, frames });
    }).on('error', reject);
  });
}

const until = async (check) => {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 10));
  assert.ok(check());
};

test('MjpegHub shares one upstream between viewers and closes it after the last one left', async (t) => {
  const cam = await fakeCamera(t);
  const hub = new MjpegHub({ lingerMs: 50 });
  const url = await hubServer(t, hub, () => cam.connect());

  const a = await viewer(url);
  assert.equal(a.res.headers['content-type'], `multipart/x-mixed-replace; boundary=${BOUNDARY}`);
  assert.equal(a.res.headers['x-accel-buffering'], 'no');
  await until(() => cam.open === 1);
  cam.send(1);
  await until(() => a.frames.length === 1);

  // a later viewer gets the last frame right away and then the live frames, over the same upstream
  const b = await viewer(url);
  await until(() => b.frames.length === 1);
  assert.deepEqual(b.frames, [1]);
  cam.send(2);
  await until(() => a.frames.length === 2 && b.frames.length === 2);
  assert.deepEqual(a.frames, [1, 2]);
  assert.deepEqual(b.frames, [1, 2]);
  assert.equal(cam.opened, 1);
  assert.equal(hub.size, 1);

  a.res.destroy();
  b.res.destroy();
  await until(() => hub.size === 0 && cam.open === 0);
});

test('MjpegHub reports a failing first connection', async (t) => {
  const hub = new MjpegHub();
  const url = await hubServer(t, hub, async () => {
    throw new Error('Kamera aus');
  });
  const res = await new Promise((r) => http.get(url, r));
  assert.equal(res.statusCode, 502);
  res.resume();
  assert.equal(hub.size, 0);
});

test('MjpegHub reopens a dropped camera connection while the viewers stay connected', async (t) => {
  const cam = await fakeCamera(t);
  const hub = new MjpegHub({ retryMs: 20, lingerMs: 20 });
  let opens = 0;
  const url = await hubServer(t, hub, () => (++opens === 2 ? Promise.reject(new Error('startet neu')) : cam.connect()));
  const v = await viewer(url);
  await until(() => cam.open === 1);
  cam.send(1);
  await until(() => v.frames.length === 1);

  cam.drop(); // camera restarts: the first reconnect fails, the second works
  await until(() => opens === 3 && cam.open === 1);
  cam.send(2);
  await until(() => v.frames.length === 2);
  assert.deepEqual(v.frames, [1, 2]);
  assert.equal(v.res.complete, false, 'the viewer connection was never closed');

  v.res.destroy();
  await until(() => hub.size === 0 && cam.open === 0);
});

test('MjpegHub skips frames for a viewer that cannot keep up', async (t) => {
  const upstream = new PassThrough();
  upstream.headers = { 'content-type': 'multipart/x-mixed-replace; boundary=cam' };
  const hub = new MjpegHub();
  t.after(() => hub.closeAll());
  const writes = [];
  const res = Object.assign(new PassThrough(), { writeHead() {}, socket: null, destroyed: false });
  res.write = (chunk) => (writes.push(chunk), true);
  await hub.attach('cam', async () => upstream, { socket: {} }, res);
  const big = Buffer.alloc(600 * 1024, 1);
  const part = (body) => Buffer.concat([Buffer.from(`--cam\r\nContent-Length: ${body.length}\r\n\r\n`), body, Buffer.from('\r\n')]);
  upstream.write(part(big));
  assert.equal(writes.length, 2, 'header and the first frame');
  Object.defineProperty(res, 'writableLength', { value: big.length });
  upstream.write(part(jpeg(3)));
  assert.equal(writes.length, 2, 'the busy viewer skipped the second frame');
});
