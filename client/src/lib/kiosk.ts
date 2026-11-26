import type { KioskAgent, VentilationConfig } from './types';

/** CO₂ thresholds of the ventilation advice (server ventilation.js `sanitizeVentilation` defaults). */
const CO2_DEFAULTS = { co2Max: 1000, co2Warn: 1400 };

/**
 * Traffic light thresholds from the ventilation advice: yellow from `co2Max` (ventilation recommended),
 * red from `co2Warn` (urgent, banner). The server only warns once airing is recommended, so red never
 * starts below yellow.
 */
export function co2Limits(v?: Partial<Pick<VentilationConfig, 'co2Max' | 'co2Warn'>> | null) {
  const yellow = Number.isFinite(v?.co2Max) ? v!.co2Max! : CO2_DEFAULTS.co2Max;
  const warn = Number.isFinite(v?.co2Warn) ? v!.co2Warn! : CO2_DEFAULTS.co2Warn;
  return { yellow, red: Math.max(yellow, warn) };
}

export function co2Status(value: number | null, limits = co2Limits()) {
  if (value === null || !Number.isFinite(value) || value <= 0) return { label: 'Keine Messwerte', color: '#94a3b8', level: null };
  if (value >= limits.red) return { label: 'Lüften erforderlich', color: '#f43f5e', level: 'red' };
  if (value >= limits.yellow) return { label: 'Lüften empfohlen', color: '#fbbf24', level: 'yellow' };
  return { label: 'Luftqualität gut', color: '#34d399', level: 'green' };
}

/** Use the latest report, not retained datapoints of a sensor that has since failed. */
export function kioskValue(agent: KioskAgent | undefined, key: string): number | null {
  const value = agent?.values[key];
  return typeof value === 'number' && Number.isFinite(value) && (key !== 'co2' || value > 0) ? value : null;
}
