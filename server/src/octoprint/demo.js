/**
 * Simulated printer of the demo mode (an OctoPrint printer, or a Bambu Lab printer, see bambu/demo.js).
 */
import { demoBambu } from '../bambu.js';
import { round1 } from '../util/number.js';

/** Name of the simulated OctoPrint printer. */
export const DEMO_NAME = 'Prusa MK4 (Demo)';
/** Name of the simulated Bambu Lab printer. */
export const DEMO_BAMBU_NAME = 'Bambu Lab P1S (Demo)';

const DEMO_PRINT_MS = 40 * 60000;
const DEMO_IDLE_MS = 5 * 60000;
const DEMO_FILE = 'Benchy_0.2mm_PLA_MK4_40m.gcode';

/** Picture of the simulated webcam: a print bed with a boat that grows with the progress. */
function demoWebcamSvg(completion, printing, now) {
  const h = Math.round(130 * (completion / 100));
  const top = 282 - h;
  const x = printing ? 320 + Math.sin(now / 650) * 58 : 450;
  const nozzleY = printing ? top - 30 : 90;
  const time = new Date(now).toLocaleTimeString('de-DE');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d2433"/><stop offset="1" stop-color="#0b0f17"/></linearGradient>
<linearGradient id="pla" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c2410c"/><stop offset=".5" stop-color="#fb923c"/><stop offset="1" stop-color="#c2410c"/></linearGradient>
<pattern id="layers" width="8" height="3" patternUnits="userSpaceOnUse"><rect width="8" height="1" fill="rgba(0,0,0,.18)"/></pattern>
<clipPath id="grow"><rect x="0" y="${top}" width="640" height="${h + 1}"/></clipPath>
</defs>
<rect width="640" height="360" fill="url(#bg)"/>
<rect x="40" y="40" width="10" height="280" fill="#2b3446"/><rect x="590" y="40" width="10" height="280" fill="#2b3446"/>
<rect x="40" y="${nozzleY - 26}" width="560" height="12" rx="3" fill="#3a4458"/>
<path d="M120 282 L520 282 L590 330 L50 330Z" fill="#1f2937" stroke="#4b5563"/>
<path d="M120 282 L520 282 L540 296 L100 296Z" fill="#374151"/>
<g clip-path="url(#grow)">
<path d="M245 282 L395 282 L410 238 L372 226 L362 170 L318 170 L310 226 L232 238Z" fill="url(#pla)"/>
<path d="M245 282 L395 282 L410 238 L372 226 L362 170 L318 170 L310 226 L232 238Z" fill="url(#layers)"/>
</g>
<g><rect x="${x - 26}" y="${nozzleY - 40}" width="52" height="34" rx="5" fill="#f97316"/><rect x="${x - 26}" y="${nozzleY - 40}" width="52" height="8" rx="3" fill="#111827"/>
<path d="M${x - 8} ${nozzleY - 6} L${x + 8} ${nozzleY - 6} L${x + 2} ${nozzleY + 6} L${x - 2} ${nozzleY + 6}Z" fill="#d1d5db"/></g>
<text x="20" y="344" fill="#fff" font-family="monospace" font-size="18" opacity=".75">${time}</text>
<text x="620" y="344" text-anchor="end" fill="#fff" font-family="monospace" font-size="18" opacity=".6">DEMO</text>
</svg>`;
}

/**
 * Simulated printer for the demo mode: prints for 40 minutes, then rests for 5 minutes. With `bambu`
 * it plays a Bambu Lab printer (AMS, fans, light and speed, see demoBambu in bambu.js).
 */
export class DemoPrinterSource {
  constructor(now = Date.now(), { bambu = false } = {}) {
    this.start = now - 12 * 60000; // the demo starts in the middle of a print
    this.bambu = bambu ? { light: true, speed: 2 } : null;
  }

  phase(now) {
    const cycle = DEMO_PRINT_MS + DEMO_IDLE_MS;
    const t = (((now - this.start) % cycle) + cycle) % cycle;
    return t < DEMO_PRINT_MS ? { printing: true, t } : { printing: false, t: t - DEMO_PRINT_MS };
  }

  /** Nozzle and bed: [actual, target]. */
  tempsAt(now) {
    const p = this.phase(now);
    if (p.printing) {
      const wobble = Math.sin(now / 9000) * 0.6;
      const nozzle = p.t < 90000 ? 25 + 190 * (p.t / 90000) : 215 + wobble;
      const bed = p.t < 60000 ? 25 + 35 * (p.t / 60000) : 60 + wobble / 3;
      return { tool0: [nozzle, 215], bed: [bed, 60] };
    }
    return { tool0: [25 + 190 * Math.exp(-p.t / 90000), 0], bed: [25 + 35 * Math.exp(-p.t / 240000), 0] };
  }

  async read(now = Date.now()) {
    const p = this.phase(now);
    const t = this.tempsAt(now);
    const total = DEMO_PRINT_MS / 1000;
    const done = p.printing ? p.t / 1000 : total;
    if (this.bambu) return demoBambu({ printing: p.printing, done, total, temps: t, settings: this.bambu, name: DEMO_BAMBU_NAME });
    return {
      state: p.printing ? 'printing' : 'idle',
      stateText: p.printing ? 'Printing' : 'Operational',
      printerError: null,
      job: { file: DEMO_FILE, path: DEMO_FILE, origin: 'local', size: 2481337, user: 'demo', estimatedPrintTime: total, filament: 3812 },
      progress: { completion: Math.round((done / total) * 1000) / 10, printTime: Math.round(done), printTimeLeft: Math.round(total - done), printTimeLeftOrigin: 'estimate' },
      temps: [
        { key: 'tool0', label: 'Düse', actual: round1(t.tool0[0]), target: t.tool0[1] },
        { key: 'bed', label: 'Bett', actual: round1(t.bed[0]), target: t.bed[1] },
      ],
      meta: { version: 'OctoPrint (Demo)', user: 'demo', name: DEMO_NAME, webcam: { enabled: true, streamUrl: '', snapshotUrl: '', flipH: false, flipV: false, rotate90: false, ratio: '16:9' } },
    };
  }

  /** Last 30 minutes in steps of 10 seconds. */
  async temps(now = Date.now()) {
    const out = { tool0: { label: 'Düse', actual: [], target: [] }, bed: { label: 'Bett', actual: [], target: [] } };
    for (let ts = now - 30 * 60000; ts <= now; ts += 10000) {
      const v = this.tempsAt(ts);
      for (const k of ['tool0', 'bed']) {
        out[k].actual.push([ts, round1(v[k][0])]);
        out[k].target.push([ts, v[k][1]]);
      }
    }
    return out;
  }

  async snapshot(now = Date.now()) {
    const p = this.phase(now);
    const completion = p.printing ? (p.t / DEMO_PRINT_MS) * 100 : 100;
    return { body: Buffer.from(demoWebcamSvg(completion, p.printing, now)), type: 'image/svg+xml' };
  }

  async openStream() {
    throw new Error('Kein Live-Stream im Demo-Modus');
  }

  /** Light and speed are simulated; a demo print cannot be paused or stopped. */
  async command(action, params = {}) {
    if (!this.bambu) throw new Error('Steuerung ist nur für Bambu-Lab-Drucker verfügbar');
    if (action === 'light') this.bambu.light = Boolean(params.on);
    else if (action === 'speed' && [1, 2, 3, 4].includes(Number(params.level))) this.bambu.speed = Number(params.level);
    else if (['pause', 'resume', 'stop'].includes(action)) throw new Error('Im Demo-Modus nicht möglich');
    else throw new Error('Unbekannter Befehl');
  }

  close() {}
}
