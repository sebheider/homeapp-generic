/**
 * Operating state and power of a heat pump, shared by its device card, the overview gauge and the
 * digital twin of the "Nexus" overview.
 */
import type { Device } from './types';

/** Electrical draw (W) above which the heat pump counts as running when no compressor datapoint is mapped. */
export const HEATPUMP_IDLE_W = 50;

const finite = (v: unknown) => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const switchedOn = (v: unknown) => v === true || v === 1 || v === '1' || v === 'true' || v === 'on';

/** A power datapoint in W; the device option `powerUnit` tells whether its values are kW. */
export function heatPumpWatts(d: Pick<Device, 'options'>, value: unknown): number | null {
  const n = finite(value);
  if (n == null) return null;
  return d.options?.powerUnit === 'kW' ? n * 1000 : n;
}

/**
 * Whether the compressor runs. The datapoint "Verdichter" may be a switch (true / 1 / "on") or a speed
 * (running while above 0); without it a noticeable electrical draw counts.
 */
export function heatPumpRunning(d: Pick<Device, 'states' | 'options'>, v: Record<string, unknown>): boolean {
  if (d.states?.compressor) return switchedOn(v.compressor) || (finite(v.compressor) ?? 0) > 0;
  const watts = d.states?.electricPower ? heatPumpWatts(d, v.electricPower) : null;
  return watts != null && watts > HEATPUMP_IDLE_W;
}

/** Operating state in words; without an on/off datapoint the heat pump counts as switched on. */
export function heatPumpState(d: Pick<Device, 'states'>, v: Record<string, unknown>, running: boolean): 'Verdichter läuft' | 'Bereit' | 'Aus' {
  if (running) return 'Verdichter läuft';
  return !d.states?.power || switchedOn(v.power) ? 'Bereit' : 'Aus';
}
