/**
 * Demo source: a simulated ioBroker installation.
 *
 * It mimics the interface of the real {@link IoBrokerSource} (states, set, search,
 * events) and runs a small physics model every two seconds: room temperatures
 * approach their setpoint, the PV output follows the sun, the battery
 * charges/discharges, blinds travel gradually, motion events appear at random and
 * a robotic mower mows the lawn (demo-mower.js).
 * Used for the first start and for developing the UI without an ioBroker.
 */
import { EventEmitter } from 'node:events';
import { demoContent, demoInitialStates } from './demo-content.js';
import { DemoMower, MOWER_COMMANDS } from './demo-mower.js';
import { coerce } from './iobroker.js';
import { clamp, round } from './util/number.js';
import { searchObjects } from './util/states.js';
import { addTimeout, clearTimeouts } from './util/timers.js';

const TICK_MS = 2000;

/** Simulated ioBroker with a believable installation, used for the demo mode. */
export class DemoSource extends EventEmitter {
  constructor() {
    super();
    this.kind = 'demo';
    this.states = new Map();
    this.connected = false;
    this.error = null;
    this.timer = null;
    /** Pending one-shot timers (motion / door resets); cleared on {@link stop}. */
    this.timers = new Set();
    /** state id of a blind -> its travel interval */
    this.travel = new Map();
    this.content = demoContent();
    this.objects = new Map();
    /** Simulated robotic mower (demo-mower.js), created on {@link start}. */
    this.mower = null;
  }

  /** Loads the start values, builds the object list for the datapoint search and starts the simulation. */
  start({ mower: mowerEnabled = true } = {}) {
    this.stop();
    this.states.clear();
    this.objects.clear();
    const now = Date.now();
    for (const [id, val] of Object.entries(demoInitialStates())) this.states.set(id, { val, ts: now, ack: true });
    // robotic mower: its own simulation; the buttons are booleans like those of the navimow adapter
    const mower = mowerEnabled ? this.content.devices.find((d) => d.type === 'mower') : null;
    this.mower = mower ? new DemoMower(mower.states) : null;
    if (this.mower) {
      for (const [id, val] of this.mower.entries(now)) this.states.set(id, { val, ts: now, ack: true });
      for (const key of MOWER_COMMANDS) if (key !== 'station' && mower.states[key]) this.states.set(mower.states[key], { val: false, ts: now, ack: true });
    }
    for (const d of this.content.devices) {
      if (!mowerEnabled && d.type === 'mower') {
        for (const id of Object.values(d.states)) this.states.delete(id);
        continue;
      }
      for (const [key, id] of Object.entries(d.states)) {
        this.objects.set(id, { id, name: `${d.name} ${key}`, type: typeof this.states.get(id)?.val, role: key, write: true });
      }
    }
    // PV yield so far today: integral of the simulated sun curve from 6:00 until now
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    const daily = Math.max(0, (14 / Math.PI) * (1 - Math.cos((Math.min(Math.max(h - 6, 0), 14) * Math.PI) / 14)) * 5.4);
    this.states.set(this.energyId('dailyYield'), { val: round(daily, 2), ts: now, ack: true });
    this.connected = true;
    this.emit('connection');
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  /** Stops the simulation, including pending motion resets and travelling blinds, so nothing is emitted afterwards. */
  stop() {
    clearInterval(this.timer);
    this.timer = null;
    clearTimeouts(this.timers);
    for (const t of this.travel.values()) clearInterval(t);
    this.travel.clear();
    this.connected = false;
  }

  /** Runs `fn` once after `ms` unless the simulation is stopped first. */
  later(fn, ms) {
    addTimeout(this.timers, fn, ms);
  }

  /** The demo always provides all of its states; nothing to subscribe. */
  setIds() {}

  /** Current value of a state. */
  val(id) {
    return this.states.get(id)?.val;
  }

  /** Sets a state and emits `state` – but only if the value really changed. */
  put(id, val, ack = true) {
    const prev = this.states.get(id);
    if (prev && prev.val === val) return;
    const entry = { val, ts: Date.now(), ack };
    this.states.set(id, entry);
    this.emit('state', id, entry);
  }

  /** Demo device by id. */
  dev(id) {
    return this.content.devices.find((d) => d.id === id);
  }

  /** State id of `key` of a demo device. */
  sid(devId, key) {
    return this.dev(devId)?.states[key];
  }

  /** State id of an energy datapoint (production, grid, batterySoc, ...). */
  energyId(key) {
    return this.content.energy.states[key];
  }

  /** One simulation step (every TICK_MS). */
  tick() {
    const hour = new Date().getHours() + new Date().getMinutes() / 60;
    // sun from 6:00 to 20:00, passing clouds modulate the PV output
    const sun = Math.max(0, Math.sin(((hour - 6) / 14) * Math.PI));
    const cloud = 0.75 + 0.25 * Math.sin(Date.now() / 60000);
    const pv = Math.round(sun ** 1.3 * 6800 * cloud);

    // weather
    const outside = round(6 + 9 * Math.max(0, Math.sin(((hour - 8) / 14) * Math.PI)) + Math.sin(Date.now() / 90000), 1);
    this.put(this.sid('aussen_temp', 'value'), outside);
    this.put(this.sid('te_wp', 'outsideTemp'), outside);
    this.put(this.sid('aussen_wind', 'value'), Math.round(10 + 6 * Math.sin(Date.now() / 45000)));

    // thermostats: room temperature approaches the setpoint, the valve opens proportionally to the gap
    let heating = 0;
    for (const id of ['wz_heizung', 'sz_heizung', 'bu_heizung', 'bad_heizung']) {
      const cur = this.val(this.sid(id, 'current'));
      const tgt = this.val(this.sid(id, 'target'));
      const next = round(cur + clamp((tgt - cur) * 0.08, -0.15, 0.15) - 0.01 * (cur - 19) * 0.1, 2);
      this.put(this.sid(id, 'current'), next);
      const valve = clamp(Math.round((tgt - next) * 40), 0, 100);
      this.put(this.sid(id, 'valve'), valve);
      heating += valve;
    }
    this.put(this.sid('wz_temp', 'value'), this.val(this.sid('wz_heizung', 'current')));

    // heat pump: load follows the heat demand of the thermostats, COP improves with the outside temperature
    const wpOn = this.val(this.sid('te_wp', 'power'));
    const load = wpOn ? clamp(heating / 200, 0.15, 1) : 0;
    const ePower = Math.round(load * 1400 + (wpOn ? 100 : 0) + Math.sin(Date.now() / 5000) * 30);
    const cop = wpOn ? round(3.4 + (outside / 20) + Math.sin(Date.now() / 20000) * 0.2, 1) : 0;
    this.put(this.sid('te_wp', 'compressor'), Boolean(wpOn && load > 0.1));
    this.put(this.sid('te_wp', 'electricPower'), wpOn ? ePower : 0);
    this.put(this.sid('te_wp', 'heatPower'), wpOn ? Math.round(ePower * cop) : 0);
    this.put(this.sid('te_wp', 'cop'), cop);
    this.put(this.sid('te_wp', 'flowTemp'), wpOn ? round(30 + load * 8 + Math.sin(Date.now() / 30000), 1) : round(outside + 12, 1));
    this.put(this.sid('te_wp', 'returnTemp'), wpOn ? round(27 + load * 5, 1) : round(outside + 10, 1));

    // air conditioner: moves towards the setpoint while on, drifts back to 22.5 °C while off
    const klima = this.dev('wz_klima');
    if (klima) {
      const on = this.val(klima.states.power);
      const cur = this.val(klima.states.current);
      const tgt = this.val(klima.states.target);
      const drift = on ? clamp((tgt - cur) * 0.15, -0.2, 0.2) : (22.5 - cur) * 0.01;
      this.put(klima.states.current, round(cur + drift, 2));
    }

    // random walk of the air quality sensors
    this.put(this.sid('bu_co2', 'value'), Math.round(clamp(this.val(this.sid('bu_co2', 'value')) + (Math.random() - 0.48) * 40, 450, 1500)));
    this.put(this.sid('wz_hum', 'value'), Math.round(clamp(this.val(this.sid('wz_hum', 'value')) + (Math.random() - 0.5) * 2, 30, 65)));

    // smart plugs report their consumption while switched on
    const washer = this.val(this.sid('te_waschm', 'power'));
    this.put(this.sid('te_waschm', 'consumption'), washer ? Math.round(380 + Math.random() * 90) : 0);
    const coffee = this.val(this.sid('ku_kaffee', 'power'));
    this.put(this.sid('ku_kaffee', 'consumption'), coffee ? Math.round(1150 + Math.random() * 100) : 0);

    // house consumption = base load + lights + heat pump + plugs
    const lights = this.content.devices
      .filter((d) => d.type === 'light' && this.val(d.states.power))
      .reduce((n, d) => n + 8 + (this.val(d.states.brightness) ?? 100) * 0.12, 0);
    const consumption = Math.round(
      180 + lights + (wpOn ? ePower : 0) + (washer ? 430 : 0) + (coffee ? 1180 : 0) + Math.random() * 40,
    );
    // battery: charges from surplus, discharges on deficit (max. 3 kW, 10–100 % SoC)
    const soc = this.val(this.energyId('batterySoc'));
    let battery = 0;
    const surplus = pv - consumption;
    if (surplus > 100 && soc < 100) battery = -Math.min(surplus, 3000);
    else if (surplus < -100 && soc > 10) battery = Math.min(-surplus, 3000);
    // battery > 0 discharges into the house, < 0 charges; the grid covers the rest
    const grid = consumption - pv - battery;
    this.put(this.energyId('production'), pv);
    this.put(this.energyId('consumption'), consumption);
    this.put(this.energyId('battery'), battery);
    this.put(this.energyId('grid'), Math.round(grid));
    this.put(this.energyId('batterySoc'), round(clamp(soc - battery / 3000 * 0.05, 5, 100), 1));
    // kWh produced during this tick: W * tick seconds / 3 600 000
    const daily = round((this.val(this.energyId('dailyYield')) || 0) + (pv * (TICK_MS / 1000)) / 3600000, 3);
    this.put(this.energyId('dailyYield'), daily);
    this.put(this.energyId('totalYield'), round(8421 + daily, 1));

    // occasional motion (normal or people) and door events
    if (Math.random() < 0.04) {
      const cam = this.content.cameras[Math.floor(Math.random() * this.content.cameras.length)];
      const state = Math.random() < 0.4 ? cam.peopleState : cam.motionState;
      this.put(state, true);
      this.later(() => this.put(state, false), 8000);
    }
    if (Math.random() < 0.05) {
      const id = this.sid('flur_motion', 'value');
      this.put(id, true);
      this.later(() => this.put(id, false), 12000);
    }
    // now and then (about every 10 minutes) the front door opens for 20 s -> sample alarm that needs acknowledgement
    const door = this.sid('haustuer', 'value');
    if (Math.random() < 0.0035 && !this.val(door)) {
      this.put(door, true);
      this.later(() => this.put(door, false), 20000);
    }

    if (this.mower) {
      this.mower.tick(Date.now());
      this.publishMower();
    }
  }

  /** Emits the changed datapoints of the simulated mower. */
  publishMower() {
    for (const [id, val] of this.mower.entries(Date.now())) this.put(id, val);
  }

  /** Demo cameras: an animated SVG instead of a real picture. */
  cameraSvg(camId) {
    const cam = this.content.cameras.find((c) => c.id === camId);
    if (!cam) return null;
    const t = Date.now() / 1000;
    const hue = 200 + Number(camId) * 28;
    const x = 160 + Math.sin(t / 3 + Number(camId)) * 110;
    const motion = this.val(cam.motionState) || this.val(cam.peopleState);
    const time = new Date().toLocaleTimeString('de-DE');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue},45%,26%)"/><stop offset="1" stop-color="hsl(${hue},35%,10%)"/></linearGradient></defs>
<rect width="640" height="360" fill="url(#g)"/>
<path d="M0 250 L640 220 L640 360 L0 360Z" fill="hsl(${hue},25%,14%)"/>
<rect x="${x + 120}" y="150" width="60" height="110" rx="6" fill="hsl(${hue},20%,20%)"/>
<rect x="${x + 330}" y="110" width="90" height="150" rx="6" fill="hsl(${hue},20%,18%)"/>
${motion ? `<g><circle cx="${x + 230}" cy="190" r="16" fill="#e8d5c0"/><rect x="${x + 212}" y="208" width="36" height="62" rx="12" fill="#d96b4a"/></g><rect x="${x + 190}" y="165" width="82" height="118" fill="none" stroke="#ff5d5d" stroke-width="3" stroke-dasharray="8 5"/>` : ''}
<rect width="640" height="360" fill="none" stroke="rgba(255,255,255,.08)"/>
<text x="620" y="344" text-anchor="end" fill="#fff" font-family="monospace" font-size="18" opacity=".6">DEMO</text>
<text x="20" y="344" fill="#fff" font-family="monospace" font-size="18" opacity=".75">${time}</text>
<circle cx="610" cy="26" r="7" fill="#ff3b3b"><animate attributeName="opacity" values="1;.2;1" dur="1.6s" repeatCount="indefinite"/></circle>
</svg>`;
  }

  /** Sets a state like ioBroker would (value coerced to the object type). */
  async set(id, value) {
    const val = coerce(value, this.objects.get(id)?.type);
    // buttons of the mower (and its charging station position) go to the mower simulation
    const mowerKey = this.mower?.keyOf(id);
    if (mowerKey && this.mower.command(mowerKey, val)) {
      this.publishMower();
      return;
    }
    const blind = this.content.devices.find((d) => d.type === 'blind' && d.states.position === id);
    if (!blind) return this.put(id, val);
    // blinds travel gradually; the position state reports the actual value
    const target = clamp(Number(val) || 0, 0, 100);
    clearInterval(this.travel.get(id));
    this.travel.set(id, setInterval(() => {
      const cur = Number(this.val(id)) || 0;
      const next = cur + clamp(target - cur, -10, 10);
      this.put(id, next);
      if (next === target) {
        clearInterval(this.travel.get(id));
        this.travel.delete(id);
      }
    }, 400));
  }

  /** Datapoint search for the settings page (same semantics as {@link IoBrokerSource#search}). */
  search(q, limit = 30) {
    return searchObjects(this.objects.values(), q, limit);
  }

  /** Synthetic past values for the demo charts. */
  history(id, hours = 24, points = 144) {
    const now = Date.now();
    const cur = Number(this.val(id)) || 0;
    const e = this.content.energy.states;
    const out = [];
    for (let i = points; i >= 0; i--) {
      const t = now - (i * hours * 3600000) / points;
      const d = new Date(t);
      const h = d.getHours() + d.getMinutes() / 60;
      const sun = Math.max(0, Math.sin(((h - 6) / 14) * Math.PI));
      const wobble = Math.sin(t / 700000) * 0.5 + Math.sin(t / 150000) * 0.5;
      let v;
      if (id === e.production) v = sun ** 1.3 * 6800 * (0.8 + 0.2 * wobble);
      else if (id === e.consumption) v = 500 + 900 * Math.max(0, Math.sin(((h - 5) / 6) * Math.PI)) + 1200 * Math.max(0, Math.sin(((h - 16) / 6) * Math.PI)) + 150 * wobble;
      else if (id === e.grid) v = 300 + 700 * Math.sin(h / 3.5) - sun * 3500;
      else if (id === e.battery) v = sun > 0.2 ? -2000 * sun : 900 * (1 - sun);
      else if (id === e.batterySoc) v = 30 + 65 * Math.max(0, Math.min(1, (h - 7) / 8)) * (h < 17 ? 1 : Math.max(0.35, 1 - (h - 17) / 8));
      else v = cur + Math.sin(h / 3.8 + id.length) * Math.max(1, Math.abs(cur) * 0.06) + wobble * 0.3;
      out.push([Math.round(t), round(v, 2)]);
    }
    return out;
  }

  status() {
    return { connected: this.connected, error: null, objects: this.objects.size, demo: true };
  }
}
