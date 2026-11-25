/**
 * Minimal MQTT 3.1.1 client (QoS 0) – just enough for the local broker of a Bambu Lab printer:
 * CONNECT with user and password, SUBSCRIBE, PUBLISH, PINGREQ keep-alive and DISCONNECT. Incoming
 * QoS 1 messages are acknowledged. It runs over TLS by default (Bambu: port 8883, self-signed
 * certificate); a socket factory can be passed for tests.
 *
 * Events: `connect`, `message` (topic, payload Buffer), `close` (Error|null) – emitted exactly once.
 */
import net from 'node:net';
import tls from 'node:tls';
import { EventEmitter } from 'node:events';

const CONNECT = 1;
const CONNACK = 2;
const PUBLISH = 3;
const PUBACK = 4;
const SUBSCRIBE = 8;
const SUBACK = 9;
const PINGREQ = 12;
const DISCONNECT = 14;
/** Largest packet accepted from the broker (full Bambu reports are ~20 KB). */
const MAX_PACKET = 4 * 1024 * 1024;

/** Return codes of CONNACK (German). */
export const CONNACK_ERRORS = {
  1: 'Protokollversion nicht unterstützt',
  2: 'Client-ID abgelehnt',
  3: 'Dienst nicht verfügbar',
  4: 'Benutzername oder Passwort falsch',
  5: 'Nicht autorisiert',
};

/** MQTT "remaining length" as variable-length integer. */
export function encodeLength(n) {
  const out = [];
  do {
    let byte = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) byte |= 0x80;
    out.push(byte);
  } while (n > 0);
  return Buffer.from(out);
}

const str = (s) => {
  const b = Buffer.from(String(s), 'utf8');
  const len = Buffer.alloc(2);
  len.writeUInt16BE(b.length);
  return Buffer.concat([len, b]);
};

/** A packet with fixed header `type << 4 | flags` and the given body. */
export const packet = (type, flags, body = Buffer.alloc(0)) => Buffer.concat([Buffer.from([(type << 4) | flags]), encodeLength(body.length), body]);

/**
 * Splits a byte stream into MQTT packets: `{ type, flags, body }`. Returns the packets and the rest
 * of the buffer (an incomplete packet). Throws on a malformed length or an oversized packet.
 */
export function readPackets(buf) {
  const out = [];
  let pos = 0;
  for (;;) {
    if (buf.length - pos < 2) break;
    let len = 0;
    let mult = 1;
    let i = pos + 1;
    let complete = false;
    for (let n = 0; n < 4 && i < buf.length; n++, i++) {
      len += (buf[i] & 0x7f) * mult;
      mult *= 128;
      if (!(buf[i] & 0x80)) {
        complete = true;
        i++;
        break;
      }
      if (n === 3) throw new Error('Ungültige MQTT-Paketlänge');
    }
    if (!complete) break;
    if (len > MAX_PACKET) throw new Error('MQTT-Paket zu groß');
    if (buf.length < i + len) break;
    out.push({ type: buf[pos] >> 4, flags: buf[pos] & 0x0f, body: buf.subarray(i, i + len) });
    pos = i + len;
  }
  return { packets: out, rest: buf.subarray(pos) };
}

/** Topic and payload of an incoming PUBLISH body (and its packet id for QoS > 0). */
export function parsePublish(flags, body) {
  const qos = (flags >> 1) & 3;
  const tlen = body.readUInt16BE(0);
  const topic = body.toString('utf8', 2, 2 + tlen);
  let pos = 2 + tlen;
  let id = null;
  if (qos > 0) {
    id = body.readUInt16BE(pos);
    pos += 2;
  }
  return { topic, qos, id, payload: body.subarray(pos) };
}

export class MqttClient extends EventEmitter {
  /**
   * @param {{host: string, port?: number, username?: string, password?: string, clientId?: string,
   *   tls?: boolean, rejectUnauthorized?: boolean, keepalive?: number, connectTimeout?: number,
   *   createSocket?: () => import('node:net').Socket}} opts
   */
  constructor(opts) {
    super();
    this.opts = { port: 8883, tls: true, rejectUnauthorized: false, keepalive: 30, connectTimeout: 10000, ...opts };
    this.connected = false;
    this.closed = false;
    this.buf = Buffer.alloc(0);
    this.nextId = 1;
    this.lastIn = Date.now();
  }

  /** Opens the connection; resolves after a successful CONNACK, rejects otherwise. */
  connect() {
    const o = this.opts;
    return new Promise((resolve, reject) => {
      const sock = o.createSocket
        ? o.createSocket()
        : o.tls
          ? tls.connect({ host: o.host, port: o.port, rejectUnauthorized: o.rejectUnauthorized })
          : net.connect({ host: o.host, port: o.port });
      this.sock = sock;
      sock.setNoDelay?.(true);
      const timer = setTimeout(() => this.fail(Object.assign(new Error('Zeitüberschreitung beim Verbinden'), { code: 'ETIMEDOUT' })), o.connectTimeout);
      timer.unref?.();
      this.pending = { resolve, reject, timer };
      sock.once(o.tls && !o.createSocket ? 'secureConnect' : 'connect', () => sock.write(this.connectPacket()));
      sock.on('data', (chunk) => this.onData(chunk));
      sock.on('error', (err) => this.fail(err));
      sock.on('close', () => this.fail(null));
    });
  }

  connectPacket() {
    const o = this.opts;
    let flags = 0x02; // clean session
    if (o.username) flags |= 0x80;
    if (o.password) flags |= 0x40;
    const keep = Buffer.alloc(2);
    keep.writeUInt16BE(o.keepalive);
    const parts = [str('MQTT'), Buffer.from([4, flags]), keep, str(o.clientId || `homeapp-${Math.random().toString(36).slice(2, 10)}`)];
    if (o.username) parts.push(str(o.username));
    if (o.password) parts.push(str(o.password));
    return packet(CONNECT, 0, Buffer.concat(parts));
  }

  onData(chunk) {
    this.lastIn = Date.now();
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    let packets;
    try {
      ({ packets, rest: this.buf } = readPackets(this.buf));
    } catch (err) {
      return this.fail(err);
    }
    for (const p of packets) this.handle(p);
  }

  handle({ type, flags, body }) {
    if (type === CONNACK) {
      const rc = body[1];
      if (rc !== 0) return this.fail(Object.assign(new Error(CONNACK_ERRORS[rc] || `Verbindung abgelehnt (${rc})`), { code: 'MQTT_CONNACK', rc }));
      this.connected = true;
      const p = this.pending;
      this.pending = null;
      if (p) {
        clearTimeout(p.timer);
        p.resolve();
      }
      this.startPing();
      this.emit('connect');
    } else if (type === PUBLISH) {
      let msg;
      try {
        msg = parsePublish(flags, body);
      } catch {
        return;
      }
      if (msg.qos === 1) {
        const id = Buffer.alloc(2);
        id.writeUInt16BE(msg.id);
        this.write(packet(PUBACK, 0, id));
      }
      this.emit('message', msg.topic, msg.payload);
    } else if (type === SUBACK && body[2] === 0x80) {
      this.emit('subscribeError');
    }
    // PINGRESP and everything else only count as a sign of life (lastIn)
  }

  /** PINGREQ every keepalive; the connection counts as dead without any data for 1.5 × keepalive. */
  startPing() {
    const ms = this.opts.keepalive * 1000;
    this.ping = setInterval(() => {
      if (Date.now() - this.lastIn > ms * 1.5) return this.fail(Object.assign(new Error('Keine Antwort vom Drucker (Keep-Alive)'), { code: 'ETIMEDOUT' }));
      this.write(packet(PINGREQ, 0));
    }, ms);
    this.ping.unref?.();
  }

  write(buf) {
    if (this.sock && !this.sock.destroyed && !this.closed) this.sock.write(buf);
  }

  subscribe(topic) {
    const id = Buffer.alloc(2);
    id.writeUInt16BE(this.nextId++ & 0xffff || 1);
    this.write(packet(SUBSCRIBE, 0x02, Buffer.concat([id, str(topic), Buffer.from([0])])));
  }

  publish(topic, payload) {
    if (!this.connected) throw Object.assign(new Error('Nicht mit dem Drucker verbunden'), { code: 'ENOTCONN' });
    this.write(packet(PUBLISH, 0, Buffer.concat([str(topic), Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload))])));
  }

  /** Closes the connection (polite DISCONNECT first). */
  end() {
    if (this.closed) return;
    if (this.connected) this.write(packet(DISCONNECT, 0));
    this.fail(null);
  }

  fail(err) {
    if (this.closed) return;
    this.closed = true;
    this.connected = false;
    clearInterval(this.ping);
    this.sock?.destroy();
    const p = this.pending;
    this.pending = null;
    if (p) {
      clearTimeout(p.timer);
      p.reject(err || Object.assign(new Error('Verbindung vom Drucker getrennt'), { code: 'ECONNRESET' }));
    }
    this.emit('close', err);
  }
}
