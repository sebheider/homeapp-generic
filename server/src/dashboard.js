/**
 * Freely designable start page ("Eigene" overview design): widgets placed in a grid of 12 columns.
 *
 *   customDashboard: {
 *     widgets: [{ id, type, x, y, w, h, options: { ... } }, ...]
 *   }
 *
 *   type     kind of widget (see WIDGET_TYPES; must match client/src/lib/widgets.ts)
 *   x, y     column (0 … 11) and row (0 …) of the top left cell
 *   w, h     width in columns and height in rows
 *   options  widget specific settings (title, text, device / room / camera ids, switches)
 *
 * It is saved with its own endpoint (PUT /api/dashboard), not with the settings editor, so an open
 * settings page can not overwrite a start page that was designed meanwhile.
 */

export const GRID_COLS = 12;
export const MAX_ROWS = 200;
export const MAX_HEIGHT = 24;
export const MAX_WIDGETS = 60;
export const WIDGET_TYPES = [
  'clock', 'status', 'weather', 'weatherPart', 'gauge', 'energy', 'energyPart', 'security', 'camera', 'rooms', 'room', 'scenes', 'lights', 'devices', 'text', 'printer', 'spotify', 'waste', 'ventilation', 'kiosk',
  'extension',
];

const int = (v, min, max, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Widget settings: a few plain values (text, numbers, switches, lists of ids); everything else is dropped. */
function sanitizeOptions(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
  const out = {};
  for (const [k, v] of Object.entries(o).slice(0, 20)) {
    if (!/^[a-zA-Z]{1,30}$/.test(k)) continue;
    if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'string') out[k] = v.slice(0, 2000);
    else if (Array.isArray(v)) out[k] = [...new Set(v.filter((x) => typeof x === 'string' && x).map((x) => x.slice(0, 120)))].slice(0, 100);
  }
  return out;
}

/** Cleans one widget; null for unknown types. */
export function sanitizeWidget(w) {
  if (!w || typeof w !== 'object' || !WIDGET_TYPES.includes(w.type)) return null;
  const width = int(w.w, 1, GRID_COLS, 4);
  return {
    id: typeof w.id === 'string' && w.id ? w.id.slice(0, 60) : '',
    type: w.type,
    x: int(w.x, 0, GRID_COLS - width, 0),
    y: int(w.y, 0, MAX_ROWS - 1, 0),
    w: width,
    h: int(w.h, 1, MAX_HEIGHT, 3),
    options: sanitizeOptions(w.options),
  };
}

/** Cleans the whole start page: known widget types only, positions inside the grid, unique ids. */
export function sanitizeDashboard(d = {}) {
  const list = Array.isArray(d?.widgets) ? d.widgets : [];
  const taken = new Set();
  const widgets = [];
  for (const raw of list) {
    if (widgets.length >= MAX_WIDGETS) break;
    const w = sanitizeWidget(raw);
    if (!w) continue;
    let id = w.id || `${w.type}`;
    for (let i = 2; taken.has(id); i++) id = `${w.id || w.type}-${i}`;
    taken.add(id);
    widgets.push({ ...w, id });
  }
  return { widgets };
}
