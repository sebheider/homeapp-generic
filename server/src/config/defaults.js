/**
 * Default configuration of a fresh installation and the allowed values of the app settings.
 */
import crypto from 'node:crypto';
import { sanitizeBambu } from '../bambu.js';
import { sanitizeDashboard } from '../dashboard.js';
import { sanitizeKiosk } from '../kiosk.js';
import { sanitizeLayouts } from '../layouts.js';
import { sanitizeModules } from '../modules.js';
import { sanitizeOctoPrint } from '../octoprint.js';
import { sanitizePushover } from '../pushover.js';
import { sanitizeSpotify } from '../spotify.js';
import { clampNumber } from '../util/number.js';
import { sanitizeVentilation } from '../ventilation.js';
import { sanitizeWaste } from '../waste.js';

/** Where the camera pop-up appears and how large it is. */
export const POPUP_POSITIONS = ['center', 'corner'];
export const POPUP_SIZES = ['medium', 'large', 'full'];

/** Allowed range of the camera picture refresh intervals (seconds). */
const REFRESH_MIN = 0.5;
const REFRESH_MAX = 300;
/** Refresh interval in seconds within the allowed range; `fallback` for missing or invalid values. */
export const refreshSeconds = (v, fallback) => clampNumber(v, REFRESH_MIN, REFRESH_MAX, fallback);

/** Default configuration of a fresh installation (starts in demo mode). */
export const defaults = () => ({
  version: 1,
  app: {
    name: 'Zuhause',
    motionPopup: true, // pop-up for normal motion
    motionPopupSeconds: 30,
    peoplePopup: true, // pop-up for advanced detection (people)
    peoplePopupSeconds: 60,
    popupRules: [], // schedule rules for the pop-ups, see popup-rules.js
    popupPosition: 'center', // 'center' (dialog in the middle) or 'corner' (small window bottom right)
    popupSize: 'large', // 'medium', 'large' or 'full' (almost the whole screen)
    snapshotRefreshSeconds: 3, // camera pictures inside the app (overview, camera page)
    popupSnapshotRefreshSeconds: 1, // camera picture of the motion pop-up (without live video or as fallback)
    popupLiveVideo: true, // motion pop-up shows the MJPEG live stream instead of refreshing pictures
  },
  iobroker: { mode: 'demo', host: '', port: 8081, secure: false, protocol: 'ws', user: '', password: '', verifySsl: false },
  homeassistant: { url: '', token: '', verifySsl: true },
  modules: sanitizeModules(),
  surveillance: {
    enabled: false,
    host: '',
    port: 5000,
    https: false,
    account: '',
    password: '',
    deviceId: '', // device token issued by DSM after a successful 2-factor login
    verifySsl: false,
    pollSeconds: 5,
    motionCooldownSeconds: 60,
    eventReasons: '2,3,9', // event "reason" codes that count as normal motion (2 motion, 3 alarm, 9 action rule)
    peopleReasons: '7', // reason codes that count as advanced detection / people (7 analytics)
  },
  // 3D printer: kind (`type`), OctoPrint connection (`apiKey` is a secret), overview display and webcam pop-ups, see octoprint.js
  octoprint: sanitizeOctoPrint(),
  // Bambu Lab printer (`octoprint.type: 'bambu'`): LAN connection (`accessCode` is a secret), camera, control, see bambu.js
  bambu: sanitizeBambu(),
  // Spotify Connect: client id of the own Spotify app; `refreshToken` (secret) and `account` come from the login, see spotify.js
  spotify: sanitizeSpotify(),
  webhookToken: crypto.randomBytes(16).toString('hex'),
  // the Raspberry Pi agents of wall displays report their sensors with this token, see kiosk.js
  kioskToken: crypto.randomBytes(16).toString('hex'),
  kiosk: sanitizeKiosk(), // settings sent to the kiosk agents (screen off, brightness, sensors)
  waste: sanitizeWaste(), // waste collection calendar (ICS) and its hints, see waste.js
  ventilation: sanitizeVentilation(), // ventilation advice, see ventilation.js
  // push notifications via Pushover (`user` and `token` are secrets), see pushover.js
  pushover: sanitizePushover(),
  rooms: [],
  devices: [],
  energy: { enabled: false, states: {}, gridInvert: false, batteryInvert: false },
  weather: {
    enabled: true,
    name: '', // display name of the location
    latitude: null, // null = location not set yet
    longitude: null,
    radar: true,
    windUnit: 'kmh', // unit of the local wind sensors: 'kmh' or 'ms'
    // local weather station (ioBroker datapoints), see WEATHER_STATE_KEYS
    states: {},
  },
  cameras: [],
  scenes: [],
  alerts: [], // user-defined notifications, see alerts.js
  layouts: sanitizeLayouts(), // grouping and order of the pages "Licht", "Klima" and "Räume", see layouts.js
  customDashboard: sanitizeDashboard(), // freely designable start page (widgets in a grid), see dashboard.js
  // external modules: { <id>: { enabled, settings } }, the packages live in the modules folder, see extensions.js
  extensions: {},
});
