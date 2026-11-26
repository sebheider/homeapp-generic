/** Ventilation advice per room. */
import type { Severity } from './alerts';

/** One room of the ventilation advice (configured; empty list = derived from the devices). */
export interface VentilationRoom {
  id: string;
  room: string;
  name: string;
  temperature: string;
  humidity: string;
  co2: string;
  window: string;
}

export interface VentilationConfig {
  enabled: boolean;
  outdoor: { temperature: string; humidity: string };
  rooms: VentilationRoom[];
  humidityMax: number;
  minDifference: number;
  co2Max: number;
  co2Warn: number;
  cooling: boolean;
  coolAbove: number;
  coolDifference: number;
  closeHints: boolean;
  severity: 'warning' | 'info';
}

/** Current advice of a room. */
export interface VentilationRoomState {
  id: string;
  room: string | null;
  name: string;
  temperature: number | null;
  humidity: number | null;
  co2: number | null;
  windowOpen: boolean | null;
  absHumidity: number | null;
  status: 'ventilate' | 'airing' | 'ok' | 'close' | 'unknown';
  reasons: string[];
  humidOutside: boolean;
  severity: Severity;
  since: number;
  message: string;
}

/** Ventilation advice as pushed by the server. */
export interface VentilationData {
  enabled: boolean;
  outdoor: { temperature: number | null; humidity: number | null; absHumidity: number | null; source: 'sensor' | 'internet' | null } | null;
  rooms: VentilationRoomState[];
}
