/**
 * The integrations of the server and the state they share at runtime.
 *
 * {@link createContext} builds every integration once (in a fixed order: the configuration first) and
 * returns them together with the shared state – the active state source and the alert rules of the
 * current configuration – and a few helpers that combine them. The other modules of app/ get this
 * context instead of module-level variables.
 */
import path from 'node:path';
import { AlertMonitor, jsonFileStore } from '../alerts.js';
import { buildCameraList } from '../cameras.js';
import { ConfigStore, DATA_DIR } from '../config.js';
import { DemoSource } from '../demo.js';
import { ExtensionRegistry } from '../extensions.js';
import { History } from '../history.js';
import { HomeAssistantSource } from '../homeassistant.js';
import { IoBrokerSource } from '../iobroker.js';
import { KIOSK_PREFIX, KioskHub, isKioskId } from '../kiosk.js';
import { MotionHub } from '../motion.js';
import { PrinterService } from '../octoprint.js';
import { AlertTracker, PushoverService } from '../pushover.js';
import { SpotifyService } from '../spotify.js';
import { SurveillanceClient } from '../synology.js';
import { VentilationService } from '../ventilation.js';
import { WasteService } from '../waste.js';
import { WeatherService, demoForecast, validCoords } from '../weather.js';

/** Creates the integrations; nothing is connected before the configuration is applied (see apply-config.js). */
export function createContext() {
  const store = new ConfigStore(); // persisted configuration (+ environment overrides)
  // external modules installed through the settings page (MODULES_DIR, default <DATA_DIR>/modules)
  const extensions = new ExtensionRegistry({ dir: path.resolve(process.env.MODULES_DIR || path.join(DATA_DIR, 'modules')) }).load();
  store.setExtensions(extensions);
  for (const item of extensions.list()) if (item.error) console.error(`Externes Modul "${item.id}" ist fehlerhaft: ${item.error}`);
  const iobroker = new IoBrokerSource(); // real ioBroker connection
  const homeassistant = new HomeAssistantSource();
  const demo = new DemoSource(); // simulated installation for demo mode
  const surveillance = new SurveillanceClient();
  const history = new History(); // minute-resolution time series of numeric states
  const weather = new WeatherService(); // internet forecast, place search, radar index
  const printer = new PrinterService(); // 3D printer (OctoPrint or Bambu Lab, or a simulated one in demo mode)
  const spotify = new SpotifyService(); // Spotify Connect (Web API, or a simulated player in demo mode)
  const motion = new MotionHub(
    () => store.effective,
    (id) => cameraList().find((c) => c.id === String(id))?.name,
  ); // merges motion signals from all sources
  /** The currently active state source: `iobroker`, `homeassistant` or `demo`. */
  let source = demo;
  const kiosk = new KioskHub(); // local, read-only datapoints of the wall display agents (homeapp.kiosk.*)
  /** Current value of any datapoint: kiosk sensors are local, everything else comes from the source. */
  const stateValue = (id) => (isKioskId(id) ? kiosk.states.get(id) : source.states.get(id))?.val;
  /** Alert rules of the current configuration (cached: they are checked on every state change). */
  let alertRules = [];
  const alerts = new AlertMonitor(
    () => alertRules,
    stateValue,
    jsonFileStore(path.join(DATA_DIR, 'alerts.json')), // unacknowledged alarms survive a restart
  ); // user-defined notifications
  const waste = new WasteService({ dataDir: DATA_DIR }); // waste collection calendar (ICS) -> hints
  const ventilation = new VentilationService({
    getConfig: () => store.effective,
    getValue: stateValue,
    // outdoor values when there is no weather station: current conditions of the internet weather
    fetchOutdoor: async () => {
      if (!store.effective.modules.weather) return null;
      const w = store.effective.weather;
      const pos = validCoords(w?.latitude, w?.longitude);
      const f = pos ? await weather.forecast(pos.lat, pos.lon) : store.isDemo ? demoForecast() : null;
      return f ? { temperature: f.current.temp, humidity: f.current.humidity } : null;
    },
    // wall displays that ever reported CO₂ take part automatically (an offline one has no current value)
    getKioskAgents: () => kiosk.list().filter((a) => kiosk.states.has(`${KIOSK_PREFIX}${a.id}.co2`)),
  });
  const pushover = new PushoverService(); // push notifications to phones
  /** Live notifications as last seen by the push notifications (new ones are sent, ended ones may send an all-clear). */
  const pushTracker = new AlertTracker();

  /** Cameras as shown in the app (Surveillance Station / demo + the user's overrides), see cameras.js. */
  function cameraList() {
    return buildCameraList({ configured: store.effective.cameras, isDemo: store.isDemo, reported: surveillance.cameras, recentMotion: motion.recent });
  }

  return {
    store,
    extensions,
    iobroker,
    homeassistant,
    demo,
    surveillance,
    history,
    weather,
    printer,
    spotify,
    motion,
    kiosk,
    alerts,
    waste,
    ventilation,
    pushover,
    pushTracker,
    get source() {
      return source;
    },
    set source(next) {
      source = next;
    },
    get alertRules() {
      return alertRules;
    },
    set alertRules(rules) {
      alertRules = rules;
    },
    stateValue,
    cameraList,
    /** Notifications for the browser: the user's rules plus the hints of the waste calendar and the ventilation advice. */
    allAlerts: () => [...alerts.list(), ...waste.hints(), ...ventilation.hints()],
    /** Connection status of all integrations, sent to the browser on every change. */
    statusPayload: () => ({
      demo: store.isDemo,
      source: source.status(),
      surveillance: store.isDemo ? { enabled: true, connected: true, error: null, cameras: store.effective.cameras.length, demo: true } : surveillance.status(),
      printer: printer.status(),
      spotify: spotify.status(),
    }),
  };
}
