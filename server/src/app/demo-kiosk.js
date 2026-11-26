/**
 * Demo mode: a simulated wall display reports its sensors like a real kiosk agent and sends live radar
 * frames while a browser shows the radar page.
 */
import { demoKioskReport, demoRadarFrame } from '../kiosk.js';

const REPORT_MS = 10000;
const DEMO_RADAR_MS = 250; // live frames of the simulated radar (like a real agent)

/** The simulated kiosk agent `demo`. */
export class DemoKiosk {
  /** @param {{store: import('../config.js').ConfigStore, kiosk: import('../kiosk.js').KioskHub}} ctx */
  constructor({ store, kiosk }) {
    this.store = store;
    this.kiosk = kiosk;
    this.reportTimer = null;
    this.radarTimer = null;
  }

  /** Presence limit of the kiosk settings: the simulated agent applies it like a real one. */
  radarLimit() {
    return this.store.effective.kiosk?.presenceMaxDistance ?? 0;
  }

  /** Starts the simulated agent in demo mode and removes it otherwise (whenever the configuration is applied). */
  configure(demo) {
    clearInterval(this.reportTimer);
    this.reportTimer = null;
    if (demo) {
      this.kiosk.report(demoKioskReport(Date.now(), this.radarLimit()));
      this.reportTimer = setInterval(() => this.kiosk.report(demoKioskReport(Date.now(), this.radarLimit())), REPORT_MS);
    } else {
      this.kiosk.remove('demo');
    }
    this.syncRadar();
  }

  /** Sends live frames like a real agent while the radar page is open in demo mode. */
  syncRadar() {
    const run = this.kiosk.radarWatched && this.store.isDemo;
    if (run && !this.radarTimer) this.radarTimer = setInterval(() => this.kiosk.radar('demo', demoRadarFrame(Date.now(), this.radarLimit())), DEMO_RADAR_MS);
    if (!run && this.radarTimer) {
      clearInterval(this.radarTimer);
      this.radarTimer = null;
    }
  }

  stop() {
    clearInterval(this.reportTimer);
    clearInterval(this.radarTimer);
  }
}
