/**
 * Bambu Lab printer models: model code and name from `get_version`, firmware and the features that
 * differ between the models (chamber sensor, camera, second light, second aux fan).
 */
import { isObj } from '../util/object.js';
import { trimText } from '../util/text.js';

/** Models that report the chamber temperature (others send a meaningless value). */
export const CHAMBER_MODELS = new Set(['X1', 'X1C', 'X1E', 'H2D', 'H2DPRO', 'H2S', 'H2C', 'H3C', 'X2D', 'P2S']);
/** Models whose camera is an RTSPS stream (the others send JPEG pictures on port 6000). */
export const RTSP_MODELS = new Set(['X1', 'X1C', 'X1E', 'H2D', 'H2DPRO', 'H2S', 'H2C', 'H3C', 'X2D', 'P2S']);
/** Models with a second chamber light (`chamber_light2`), switched together with the first. */
export const LIGHT2_MODELS = new Set(['H2D', 'H2DPRO', 'H2S', 'H2C']);
/** Models with a second aux fan, reported as percent in `device.airduct.parts` (id 160). */
export const AUX2_FAN_MODELS = new Set(['P2S', 'X2D']);

/** Model code (X1C, P1S, A1MINI …) from the modules of `get_version`, null if unknown. */
export function modelFromModules(modules) {
  const list = Array.isArray(modules) ? modules.filter(isObj) : [];
  const products = {
    'Bambu Lab A1': 'A1', 'Bambu Lab A1 mini': 'A1MINI', 'Bambu Lab A2L': 'A2L', 'Bambu Lab P1P': 'P1P', 'Bambu Lab P1S': 'P1S', 'Bambu Lab P2S': 'P2S',
    'Bambu Lab H2C': 'H2C', 'Bambu Lab H3C': 'H3C', 'Bambu Lab H2D': 'H2D', 'Bambu Lab H2D Pro': 'H2DPRO', 'Bambu Lab H2S': 'H2S', 'Bambu Lab X2D': 'X2D',
    'Bambu Lab X1 Carbon': 'X1C', 'Bambu Lab X1E': 'X1E', 'Bambu Lab X1': 'X1',
  };
  for (const m of list) if (products[m.product_name]) return products[m.product_name];
  const ap = list.find((m) => String(m.hw_ver || '').startsWith('AP0'));
  if (!ap) return null;
  if (ap.hw_ver === 'AP02') return 'X1E';
  if (ap.project_name === 'N1') return 'A1MINI';
  if (ap.project_name === 'N2S') return 'A1';
  if (ap.project_name === 'C11') return 'P1P';
  if (ap.project_name === 'C12') return 'P1S';
  if (ap.hw_ver === 'AP05' && ap.name === 'rv1126') return 'X1C';
  return null;
}

/** Display name of a model code: `A1MINI` -> `A1 mini`. */
export const modelName = (code) => ({ A1MINI: 'A1 mini', H2DPRO: 'H2D Pro', X1C: 'X1 Carbon' })[code] ?? code;

/** Firmware version (module `ota`) from `get_version`. */
export const firmwareOf = (modules) => (Array.isArray(modules) ? trimText(modules.find((m) => m?.name === 'ota')?.sw_ver, 40) || null : null);
