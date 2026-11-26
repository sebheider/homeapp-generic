/**
 * Live push to the browsers over a WebSocket on /ws: state changes (collected and sent in batches), status,
 * notifications, printer, Spotify … and the live radar frames for browsers that show the radar page.
 */
import { WebSocketServer } from 'ws';
import { foreignRequest } from '../auth.js';

const PUSH_DELAY_MS = 80; // state changes are collected this long before they are pushed
const HEARTBEAT_MS = 30000;

/** The WebSocket server (not yet attached to the HTTP server, see {@link attachLivePush}) and its senders. */
export function createLivePush() {
  const wss = new WebSocketServer({ noServer: true });
  /** Sends a message to every connected browser. */
  const broadcast = (msg) => {
    const data = JSON.stringify(msg);
    for (const c of wss.clients) if (c.readyState === 1) c.send(data);
  };

  // State changes are collected for 80 ms and sent as one message, so a burst of
  // changes (e.g. a scene) causes a single browser update instead of dozens.
  let pending = {};
  let flushTimer = null;
  /** Drops changes that were not pushed yet (they belong to the previous source after a configuration change). */
  function dropPendingStates() {
    clearTimeout(flushTimer);
    flushTimer = null;
    pending = {};
  }
  function queueState(id, entry) {
    pending[id] = entry;
    flushTimer ??= setTimeout(() => {
      broadcast({ t: 'states', states: pending });
      pending = {};
      flushTimer = null;
    }, PUSH_DELAY_MS);
  }

  // live radar frames only go to the browsers that show the radar page (up to four per second and agent)
  function sendRadar(agent, frame) {
    const data = JSON.stringify({ t: 'radar', agent, frame });
    for (const c of wss.clients) if (c.radarWatch && c.readyState === 1) c.send(data);
  }
  /** True while at least one browser shows the radar page. */
  const radarWatched = () => [...wss.clients].some((c) => c.radarWatch);

  return { wss, broadcast, dropPendingStates, queueState, sendRadar, radarWatched };
}

/**
 * Serves the WebSocket of `live` on the /ws path of `server`, with the same authentication as the REST API.
 * @param {{authorized: (header: string|undefined) => boolean, statusPayload: () => object, onRadarWatch: () => void}} opts
 *   `onRadarWatch` is called whenever a browser opens or leaves the radar page
 */
export function attachLivePush(server, { wss }, { authorized, statusPayload, onRadarWatch }) {
  server.on('upgrade', (req, socket, head) => {
    if (!req.url?.startsWith('/ws') || !authorized(req.headers.authorization) || foreignRequest(req.headers)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
  });
  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.radarWatch = false;
    ws.on('pong', () => (ws.isAlive = true));
    // the only message of the browser: `{t: 'radar', watch}` while it shows the radar page
    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      if (msg?.t !== 'radar') return;
      ws.radarWatch = msg.watch === true;
      onRadarWatch();
    });
    ws.on('close', () => {
      ws.radarWatch = false;
      onRadarWatch();
    });
    ws.send(JSON.stringify({ t: 'status', status: statusPayload() }));
  });
  // Heartbeat: connections that do not answer a ping are dropped, so dead browser tabs do not pile up.
  setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_MS);
}
