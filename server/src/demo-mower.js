/**
 * Simulated robotic mower of the demo mode, with the datapoints of the navimow adapter.
 *
 * The mower mows a rectangular lawn in parallel lanes, drives from the charging station to its lane and
 * back, drains its battery while it moves and charges in the station. Like the adapter it reports the
 * state as `vehicleState` text (isRunning, isDocked, ...), the position in metres, the mowing progress
 * and the map track as JSON (`{ percentage, area, progressAt, points: [[x, y, heading], …] }`). Docked
 * with a full battery it sets off again on its own after a while, so the demo always has something to
 * show. {@link DemoMower#command} handles the buttons (start, pause, resume, home, refresh, resetMap)
 * and a written charging station position.
 */
import { clamp, round } from './util/number.js';

/** Lawn in mower coordinates (metres), lane spacing and charging station. */
const LAWN = { minX: -7, maxX: 7, minY: -11, maxY: -1 };
const LAWN_AREA = (LAWN.maxX - LAWN.minX) * (LAWN.maxY - LAWN.minY);
const LANE = 0.2;
const STATION = { x: 8.6, y: -6 };
/** Map frame like the adapter publishes it: the area around lawn and station, snapped to whole metres. */
const FRAME = { minX: -9, maxX: 11, minY: -13, maxY: 1, width: 800, height: 560, scale: 40 };
/** Metres per tick (one tick = 2 s). */
const STEP = 1.2;
/** Battery per tick while moving / charging (%). */
const DRAIN = 0.12;
const CHARGE = 0.6;
/** Below this charge the mower interrupts the session and returns to the station. */
const LOW_BATTERY = 20;
/** Ticks the mower rests in the station with a full battery before it sets off on its own. */
const REST_TICKS = 45;
/** The track is written every few ticks (the adapter writes it at most every 30 s). */
const TRACK_EVERY = 5;
const STATUS_EVERY = 15;

/** vehicleState per phase (the adapter's values). */
const VEHICLE_STATE = { mowing: 'isRunning', leaving: 'isRunning', returning: 'isDocking', docked: 'isDocked', paused: 'isPaused' };
/** Buttons of the adapter; `station` is the writable charging station position. */
export const MOWER_COMMANDS = ['start', 'pause', 'resume', 'home', 'refresh', 'resetMap', 'station'];

const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Waypoints of a whole session: lanes from the bottom to the top of the lawn, alternating direction. */
function laneWaypoints() {
  const pts = [];
  const n = Math.floor((LAWN.maxY - LAWN.minY) / LANE);
  for (let i = 0; i < n; i++) {
    const y = round(LAWN.minY + LANE / 2 + i * LANE, 2);
    const left = LAWN.minX + 0.2;
    const right = LAWN.maxX - 0.2;
    pts.push(...(i % 2 === 0 ? [[left, y], [right, y]] : [[right, y], [left, y]]));
  }
  return pts;
}

/** Simulated mower; `states` maps the datapoint keys of the device (state, battery, x, ...) to ids. */
export class DemoMower {
  constructor(states) {
    this.ids = states;
    this.lanes = laneWaypoints();
    this.cum = [0];
    for (let i = 1; i < this.lanes.length; i++) this.cum.push(this.cum[i - 1] + dist(this.lanes[i - 1], this.lanes[i]));
    this.total = this.cum.at(-1);
    this.battery = 64;
    this.weekArea = 212.4;
    this.station = { ...STATION };
    this.pos = [STATION.x, STATION.y];
    this.heading = Math.PI;
    this.ticks = 0;
    this.rest = 0;
    this.positionAt = Date.now();
    this.updatedAt = Date.now();
    this.newSession();
    // the demo starts in the middle of a session: from the station to the first lane, then 38 % mowed
    this.travel(this.lanes[0]);
    this.mow(this.total * 0.385);
    this.phase = 'mowing';
    this.writeTrack(Date.now());
  }

  /** Datapoint key of a state id of this mower (undefined for foreign ids). */
  keyOf(id) {
    return Object.keys(this.ids).find((k) => this.ids[k] === id);
  }

  /** Forgets the track and starts the lanes from the beginning. */
  newSession() {
    this.wp = 0;
    this.mowed = 0;
    this.done = false;
    this.resumeAt = this.lanes[0];
    this.track = [];
    this.mark();
  }

  /** Mowed share of the lawn (0 … 1) along the lane path; it only moves while the mower is on its lanes. */
  fraction() {
    if (this.done) return 1;
    if (this.wp === 0) return 0;
    if (this.phase && this.phase !== 'mowing' && !(this.phase === 'paused' && this.pausedFrom === 'mowing')) return this.mowed ?? 0;
    return clamp((this.cum[this.wp - 1] + dist(this.lanes[this.wp - 1], this.pos)) / this.total, 0, 1);
  }

  /** Adds the current position to the track (unless it is already its last point). */
  mark() {
    const p = [round(this.pos[0], 2), round(this.pos[1], 2), round(this.heading, 3)];
    const last = this.track.at(-1);
    if (!last || last[0] !== p[0] || last[1] !== p[1]) this.track.push(p);
  }

  /** Moves straight towards `target` by at most `step` metres; returns true on arrival. */
  travel(target, step = Infinity) {
    const d = dist(this.pos, target);
    if (d > 1e-6) this.heading = Math.atan2(target[1] - this.pos[1], target[0] - this.pos[0]);
    if (d <= step) {
      this.pos = [...target];
      this.mark();
      return true;
    }
    this.pos = [this.pos[0] + ((target[0] - this.pos[0]) / d) * step, this.pos[1] + ((target[1] - this.pos[1]) / d) * step];
    return false;
  }

  /** Mows `step` metres along the lanes (turning points become track points). */
  mow(step) {
    const before = this.fraction();
    let left = step;
    while (left > 0 && this.wp < this.lanes.length) {
      const target = this.lanes[this.wp];
      const d = dist(this.pos, target);
      if (this.travel(target, left)) {
        this.wp++;
        left -= d;
      } else {
        left = 0;
      }
    }
    if (this.wp >= this.lanes.length) this.done = true;
    this.mowed = this.fraction();
    this.weekArea += (this.mowed - before) * LAWN_AREA;
  }

  /** Sets off from the station (or a pause) towards the lane where the session continues. */
  setOff() {
    if (this.done) this.newSession();
    this.phase = this.wp > 0 && dist(this.pos, this.resumeAt) < 0.05 ? 'mowing' : 'leaving';
    this.rest = 0;
  }

  /** Heads back to the station; the session continues at the current lane position later. */
  goHome() {
    if (this.phase === 'mowing' || (this.phase === 'paused' && this.pausedFrom === 'mowing')) this.resumeAt = [...this.pos];
    this.phase = 'returning';
  }

  /** One simulation step (every 2 s). */
  tick(now = Date.now()) {
    this.ticks++;
    const before = this.phase;
    const moving = this.phase === 'mowing' || this.phase === 'leaving' || this.phase === 'returning';
    if (moving) {
      this.battery = Math.max(0, this.battery - DRAIN);
      this.positionAt = now;
    }
    if (this.phase === 'mowing') {
      this.mow(STEP);
      if (this.done || this.battery <= LOW_BATTERY) this.goHome();
    } else if (this.phase === 'leaving') {
      if (this.travel(this.resumeAt, STEP)) this.phase = 'mowing';
    } else if (this.phase === 'returning') {
      if (this.travel([STATION.x, STATION.y], STEP)) {
        this.phase = 'docked';
        // like the adapter: the position of the docked mower becomes the charging station once it is unknown
        this.station ??= { ...STATION };
      }
    } else if (this.phase === 'docked') {
      this.battery = Math.min(100, this.battery + CHARGE);
      if (this.battery >= 100 && ++this.rest > REST_TICKS) this.setOff();
    }
    if (this.phase !== before) this.updatedAt = now;
    if ((moving && this.ticks % TRACK_EVERY === 0) || this.phase !== before) this.writeTrack(now);
    if (this.ticks % STATUS_EVERY === 0) this.updatedAt = now;
  }

  /**
   * Handles a written button or the charging station position. Returns true if `key` is one of them.
   * Buttons that do not fit the current phase are ignored, like a mower in the field would.
   */
  command(key, value, now = Date.now()) {
    if (!MOWER_COMMANDS.includes(key)) return false;
    const before = this.phase;
    if (key === 'start' || key === 'resume') {
      if (this.phase === 'paused') this.phase = this.pausedFrom;
      else if (this.phase === 'docked' || this.phase === 'returning') this.setOff();
    } else if (key === 'pause') {
      if (this.phase === 'mowing' || this.phase === 'leaving' || this.phase === 'returning') {
        this.pausedFrom = this.phase;
        this.phase = 'paused';
      }
    } else if (key === 'home') {
      if (this.phase !== 'docked') this.goHome();
    } else if (key === 'resetMap') {
      this.track = [];
      this.mark();
      this.writeTrack(now);
    } else if (key === 'station') {
      // an empty value forgets the station: the next docking determines it again
      this.station = parseStation(value);
    }
    if (this.phase !== before || key === 'refresh') this.updatedAt = now;
    return true;
  }

  /** Serialises the track like the adapter (rounded to centimetres, heading as third element). */
  writeTrack(now) {
    const here = [round(this.pos[0], 2), round(this.pos[1], 2), round(this.heading, 3)];
    const last = this.track.at(-1);
    const points = last && last[0] === here[0] && last[1] === here[1] ? this.track : [...this.track, here];
    this.trackJson = JSON.stringify({ percentage: this.percentage(), area: this.area(), progressAt: now, points });
  }

  percentage() {
    return Math.floor(this.fraction() * 100);
  }

  area() {
    return round(this.fraction() * LAWN_AREA, 2);
  }

  /** Current value of every datapoint of the mower as `[id, value]` (buttons are not included). */
  entries(now = Date.now()) {
    const values = {
      state: VEHICLE_STATE[this.phase],
      battery: Math.round(this.battery),
      progress: this.percentage(),
      area: this.area(),
      weekArea: round(this.weekArea, 2),
      x: round(this.pos[0], 2),
      y: round(this.pos[1], 2),
      heading: round(this.heading, 3),
      positionTime: this.positionAt,
      track: this.trackJson,
      frame: JSON.stringify(FRAME),
      station: this.station ? JSON.stringify({ x: this.station.x, y: this.station.y }) : '',
      updated: this.updatedAt || now,
      model: 'i108',
      firmware: '0066',
      online: true,
    };
    return Object.entries(values).filter(([k]) => this.ids[k]).map(([k, v]) => [this.ids[k], v]);
  }
}

/** Charging station position from `{"x":…,"y":…}` (null for empty or invalid values). */
function parseStation(value) {
  try {
    const p = typeof value === 'string' ? JSON.parse(value) : value;
    return p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)) ? { x: Number(p.x), y: Number(p.y) } : null;
  } catch {
    return null;
  }
}
