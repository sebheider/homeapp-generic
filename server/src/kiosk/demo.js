/**
 * Simulated wall display of the demo mode: sensor reports and live radar frames like a real agent.
 */

/**
 * Report of the simulated wall display in demo mode (presence comes and goes, daylight, CO₂ rises and falls).
 * `maxDistance`: presence limit of the kiosk settings (cm, 0 = whole range), as a real agent applies it.
 */
export function demoKioskReport(now = Date.now(), maxDistance = 0) {
  const d = new Date(now);
  const minutes = now / 60000;
  const hour = d.getHours() + d.getMinutes() / 60;
  const daylight = Math.max(0, Math.sin(((hour - 6) / 14) * Math.PI));
  const radar = demoRadarFrame(now, maxDistance);
  const targets = [radar.moving, radar.still].filter(Boolean);
  const lux = Math.round(4 + daylight * 420 + Math.random() * 6);
  return {
    id: 'demo',
    name: 'Wanddisplay (Demo)',
    version: 'demo',
    features: ['radar'],
    sensors: {
      presence: radar.presence,
      moving: radar.presence && Boolean(radar.moving),
      still: radar.presence && Boolean(radar.still),
      distance: targets.length ? Math.min(...targets.map((t) => t.distance)) : 0,
      lux,
      co2: Math.round(880 + 330 * Math.sin(minutes / 25)),
      temperature: Math.round((21.6 + Math.sin(minutes / 60) * 0.6) * 10) / 10,
      humidity: Math.round(47 + Math.sin(minutes / 45) * 4),
    },
    display: { on: radar.presence, wake: false, brightness: Math.round(15 + daylight * 85), method: 'demo' },
  };
}

/** Distance gates of the simulated radar (9 × 75 cm like a real LD2410). */
const DEMO_GATES = 9;
const DEMO_GATE_CM = 75;

/**
 * Live radar frame of the simulated wall display (engineering mode): someone walks up to the display and
 * away again and now and then stops in front of it; between the visits nobody is there. Targets beyond
 * `maxDistance` (cm, 0 = whole range) are shown but are no presence, like with a real agent.
 */
export function demoRadarFrame(now = Date.now(), maxDistance = 0) {
  const visitor = Math.sin(now / 60000 / 3) > -0.3;
  const s = now / 1000;
  const walk = 260 + 190 * Math.sin(s / 6); // 70 … 450 cm
  const pause = Math.sin(s / 17) > 0.45; // standing in front of the display
  const moving = visitor && !pause ? { distance: Math.round(walk), energy: Math.round(55 + 35 * Math.abs(Math.sin(s * 1.1))) } : null;
  let still = null;
  if (visitor) still = pause ? { distance: Math.round(110 + 8 * Math.sin(s * 0.7)), energy: Math.round(62 + 8 * Math.sin(s * 0.9)) } : { distance: Math.round(walk + 25), energy: 24 };
  const presence = [moving, still].some((t) => t && (!maxDistance || t.distance <= maxDistance));
  // energy per gate: a bump around each target over a small noise floor
  const gate = (target, i, phase) => {
    const noise = 3 + 5 * Math.abs(Math.sin(s * 1.7 + i * 2.3 + phase));
    const bump = target ? target.energy * Math.exp(-(((i + 0.5) * DEMO_GATE_CM - target.distance) ** 2) / (2 * 55 ** 2)) : 0;
    return Math.min(100, Math.round(noise + bump));
  };
  const gates = { moving: Array.from({ length: DEMO_GATES }, (_, i) => gate(moving, i, 0)), still: Array.from({ length: DEMO_GATES }, (_, i) => gate(still, i, 1)) };
  return { mode: 'engineering', presence, moving, still, gates, gateCm: DEMO_GATE_CM };
}
