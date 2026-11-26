/** Push channel to the server (WebSocket): applies the pushed messages to the store and reconnects. */
import { reloadIfUpdated } from '../pwa';
import { shouldShowCameraPopup } from '../cameraPopups';
import { saveHiddenPrinterJob, shouldShowPrinterPopup } from '../printer';
import type { CustomDashboard } from '../widgets';
import type { ActiveAlert, MotionEvent, PrinterData, PrinterPopupEvent, RadarFrame, SpotifyState, StateEntry, Status, VentilationData, WasteData } from '../types';
import { useStore } from '../store';

/** Messages pushed by the server over the WebSocket. */
type ServerMessage =
  | { t: 'states'; states: Record<string, StateEntry> }
  | { t: 'status'; status: Status }
  | { t: 'config' }
  | { t: 'dashboard'; dashboard: CustomDashboard }
  | { t: 'motion'; event: MotionEvent }
  | { t: 'alerts'; alerts: ActiveAlert[] }
  | { t: 'printer'; printer: PrinterData }
  | { t: 'printerPopup'; popup: PrinterPopupEvent }
  | { t: 'spotify'; spotify: SpotifyState }
  | { t: 'waste'; waste: WasteData }
  | { t: 'ventilation'; ventilation: VentilationData }
  | { t: 'radar'; agent: string; frame: RadarFrame };

/** Number of motion events kept for the activity timeline. */
const MOTION_HISTORY_LIMIT = 5000;
let ws: WebSocket | null = null;
/** Number of failed connection attempts in a row (drives the reconnect delay). */
let retry = 0;
/** Open radar views; the server streams the live radar frames to this browser while there is one. */
let radarWatchers = 0;

/**
 * Opens the push channel to the server and keeps it alive (reconnect with growing delay).
 * Message types: `states` (changed datapoints), `status` (connections), `config` (reload), `dashboard`
 * (the freely designable start page was saved),
 * `motion` (camera detected movement -> pop-up), `alerts` (active notifications),
 * `printer` (state of the 3D printer), `printerPopup` (webcam pop-up of the printer), `spotify` (Spotify playback),
 * `radar` (live frame of a presence radar, only while this browser watches, see `watchRadar`).
 */
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => {
    const reconnect = retry > 0;
    retry = 0;
    useStore.setState({ wsConnected: true });
    if (radarWatchers > 0) sendRadarWatch();
    if (reconnect) {
      useStore.getState().boot();
      // the server may have been restarted for an update: switch to the new version
      void reloadIfUpdated();
    }
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data) as ServerMessage;
    const s = useStore.getState();
    if (msg.t === 'states') useStore.setState({ states: { ...s.states, ...msg.states } });
    else if (msg.t === 'status') {
      // the Surveillance Station may finish loading its cameras after the page was opened
      const prev = s.status?.surveillance;
      const next = msg.status.surveillance;
      useStore.setState({ status: msg.status });
      if (!prev || prev.connected !== next.connected || prev.cameras !== next.cameras) s.refreshCameras();
    }
    else if (msg.t === 'config') s.boot();
    else if (msg.t === 'dashboard') {
      if (s.config) useStore.setState({ config: { ...s.config, customDashboard: msg.dashboard } });
    }
    else if (msg.t === 'motion') {
      const e: MotionEvent = msg.event;
      // a camera the list does not know yet (e.g. list still empty) -> reload the list
      if (!s.cameras.some((c) => c.id === e.cameraId)) setTimeout(() => useStore.getState().refreshCameras(), 300);
      // The server already decided whether this kind of event may pop up. A running people
      // pop-up is not replaced by a normal motion event, but a people event replaces anything.
      const show = shouldShowCameraPopup(e, s.popup, s.cameraPopupsSuppressedUntil);
      // security first: a camera pop-up replaces the webcam pop-up of the printer
      if (show && s.printerPopup) s.dismissPrinterPopup();
      useStore.setState({
        motion: [e, ...s.motion].slice(0, MOTION_HISTORY_LIMIT),
        popup: show ? e : s.popup,
        popupOverride: show ? null : s.popupOverride,
      });
    }
    else if (msg.t === 'printer') {
      // the print whose pop-ups were hidden ended (or another one started): show them again next time
      if (s.printerPopupHiddenJob && msg.printer.jobId !== s.printerPopupHiddenJob) {
        saveHiddenPrinterJob(null);
        useStore.setState({ printerPopupHiddenJob: null });
      }
      useStore.setState({ printer: msg.printer });
    }
    else if (msg.t === 'printerPopup') {
      if (shouldShowPrinterPopup(msg.popup, { hiddenJob: s.printerPopupHiddenJob, cameraPopup: s.popup != null, onPrinterPage: s.view === 'printer' })) s.showPrinterPopup(msg.popup);
    }
    else if (msg.t === 'spotify') useStore.setState({ spotify: { ...msg.spotify, receivedAt: Date.now() } });
    else if (msg.t === 'waste') useStore.setState({ waste: msg.waste });
    else if (msg.t === 'ventilation') useStore.setState({ ventilation: msg.ventilation });
    else if (msg.t === 'radar') useStore.setState({ radar: { ...s.radar, [msg.agent]: { frame: msg.frame, at: Date.now() } } });
    else if (msg.t === 'alerts') {
      // announce alerts that were not active before (info notifications only appear in the list)
      const known = new Set(s.alerts.map((a) => a.id));
      for (const a of msg.alerts) {
        if (!known.has(a.id) && a.severity !== 'info') s.toast(a.message, a.severity === 'alarm' ? 'error' : 'info');
      }
      useStore.setState({ alerts: msg.alerts });
    }
  };
  ws.onclose = () => {
    ws = null;
    useStore.setState({ wsConnected: false });
    retry++;
    setTimeout(connect, Math.min(10000, 1000 * retry));
  };
}

/** Opens the push channel unless it is open (or being opened) already. */
export function ensureConnected() {
  if (!ws) connect();
}

/** Tells the server whether this browser shows a radar page (it then streams the live radar frames). */
function sendRadarWatch() {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'radar', watch: radarWatchers > 0 }));
}

/** Asks the server for the live frames of the presence radars until the returned function is called. */
export function watchRadar() {
  radarWatchers++;
  if (radarWatchers === 1) sendRadarWatch();
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    radarWatchers--;
    if (radarWatchers === 0) sendRadarWatch();
  };
}
