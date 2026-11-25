/**
 * Freely designable start page ("Eigene" overview design): widgets placed in a grid of 12 columns
 * with rows of fixed height. Stored as `customDashboard` in the server configuration (see server
 * dashboard.js) and saved with its own endpoint.
 *
 * This module holds the catalogue of the widgets and the pure grid helpers of the editor: placing,
 * moving and resizing widgets (others make room by moving down), finding free space and the order
 * of the widgets in the one-column layout of phones.
 */

export const GRID_COLS = 12;
export const MAX_ROWS = 200;
export const MAX_HEIGHT = 24;
export const MAX_WIDGETS = 60;

export type WidgetType =
  | 'clock' | 'status' | 'weather' | 'weatherPart' | 'gauge' | 'energy' | 'energyPart' | 'security' | 'camera' | 'rooms' | 'room' | 'scenes' | 'lights' | 'devices' | 'text'
  | 'printer' | 'spotify' | 'waste' | 'ventilation' | 'kiosk' | 'extension';

/** Widget settings (title, text, ids of devices / rooms / cameras, switches). */
export type WidgetOptions = Record<string, string | number | boolean | string[]>;

/** Position and size in grid cells. */
export interface GridRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A widget placed on the start page. */
export interface Widget extends GridRect {
  id: string;
  type: WidgetType;
  options: WidgetOptions;
}

/** The freely designable start page as stored in the configuration. */
export interface CustomDashboard {
  widgets: Widget[];
}

/** Gauges a "Messinstrument" widget can show. */
export const GAUGE_KINDS = [
  { id: 'solar', label: 'Solar' },
  { id: 'battery', label: 'Batterie' },
  { id: 'autarky', label: 'Autarkie' },
  { id: 'climate', label: 'Raumklima' },
  { id: 'lights', label: 'Licht' },
  { id: 'heatpump', label: 'Wärmepumpe' },
] as const;

/** A single part of a category (weather page, energy page) that can be placed as its own widget; `size` of a new widget. */
export interface WidgetPart {
  id: string;
  label: string;
  size?: [number, number];
}

/** Parts of the weather page for the "Wetter-Detail" widget. */
export const WEATHER_PARTS: readonly WidgetPart[] = [
  { id: 'now', label: 'Aktuelle Werte', size: [6, 4] },
  { id: 'hourly', label: 'Stundenprognose', size: [6, 3] },
  { id: 'temperature', label: 'Temperaturverlauf', size: [6, 4] },
  { id: 'sun', label: 'Sonne', size: [4, 5] },
  { id: 'uv', label: 'UV-Index', size: [4, 5] },
  { id: 'forecast', label: 'Nächste 3 Tage', size: [4, 6] },
  { id: 'rain', label: 'Regen', size: [4, 4] },
  { id: 'radar', label: 'Regenradar', size: [5, 6] },
];

/** Parts of the energy page for the "Energie-Detail" widget. */
export const ENERGY_PARTS: readonly WidgetPart[] = [
  { id: 'production', label: 'Erzeugung', size: [2, 3] },
  { id: 'consumption', label: 'Verbrauch', size: [2, 3] },
  { id: 'grid', label: 'Netz', size: [2, 3] },
  { id: 'battery', label: 'Batterie', size: [3, 3] },
  { id: 'autarky', label: 'Autarkie', size: [2, 3] },
  { id: 'selfConsumption', label: 'Eigenverbrauch', size: [2, 3] },
  { id: 'chartPower', label: 'Verlauf Erzeugung & Verbrauch', size: [6, 4] },
  { id: 'chartFlow', label: 'Verlauf Netz & Batterie', size: [6, 4] },
  { id: 'chartSoc', label: 'Verlauf Batterie-Ladestand', size: [6, 4] },
];

/** Widgets that show one of several parts: the option that holds the chosen part and the list of parts. */
export const WIDGET_PARTS: Partial<Record<WidgetType, { option: string; label: string; parts: readonly WidgetPart[] }>> = {
  gauge: { option: 'kind', label: 'Messinstrument', parts: GAUGE_KINDS },
  weatherPart: { option: 'part', label: 'Anzeige', parts: WEATHER_PARTS },
  energyPart: { option: 'part', label: 'Anzeige', parts: ENERGY_PARTS },
};

/** The chosen part of a widget (undefined for widgets without parts or an unknown part). */
export function widgetPart(w: { type: WidgetType; options: WidgetOptions }): WidgetPart | undefined {
  const p = WIDGET_PARTS[w.type];
  return p?.parts.find((x) => x.id === w.options[p.option]);
}

/** Catalogue entry: name, description, size of a new widget and smallest size. */
export interface WidgetInfo {
  label: string;
  text: string;
  size: [number, number];
  min: [number, number];
  /** Settings of a new widget. */
  options?: WidgetOptions;
}

export const WIDGETS: Record<WidgetType, WidgetInfo> = {
  clock: { label: 'Uhr & Begrüßung', text: 'Digitaluhr, Datum, Begrüßung und auf Wunsch die wichtigsten Statusmeldungen.', size: [4, 3], min: [2, 2], options: { chips: true } },
  status: { label: 'Hausstatus', text: 'Der „Home Core“: zeigt, ob alles in Ordnung ist, und öffnet die Benachrichtigungen.', size: [3, 4], min: [2, 2] },
  weather: { label: 'Wetter', text: 'Außentemperatur, Wetterlage, Wind, Luftfeuchte und Sonnenzeiten.', size: [4, 3], min: [2, 2] },
  weatherPart: { label: 'Wetter-Detail', text: 'Ein Teil der Wetterseite, z. B. UV-Index, Regenradar, Sonne oder Prognose.', size: [4, 5], min: [2, 2], options: { part: 'uv' } },
  gauge: { label: 'Messinstrument', text: 'Ein Rundinstrument: Solar, Batterie, Autarkie, Raumklima, Licht oder Wärmepumpe.', size: [2, 3], min: [2, 2], options: { kind: 'climate' } },
  energy: { label: 'Energiefluss', text: 'Live-Energiefluss mit Erzeugung, Verbrauch und Netz, optional mit 24-h-Verlauf.', size: [5, 6], min: [3, 4], options: { chart: false } },
  energyPart: { label: 'Energie-Detail', text: 'Ein Wert oder Verlauf der Energieseite, z. B. Erzeugung, Batterie oder Netz.', size: [2, 3], min: [2, 2], options: { part: 'production' } },
  security: { label: 'Sicherheit', text: 'Kameras, Bewegungs-Zeitleiste und Türen / Fenster.', size: [5, 6], min: [3, 3] },
  camera: { label: 'Kamera', text: 'Live-Bild einer Kamera; ein Tipp öffnet sie groß.', size: [4, 4], min: [2, 2] },
  rooms: { label: 'Räume im Blick', text: 'Alle Räume mit Temperatur, Heizung, Licht und offenen Fenstern.', size: [12, 4], min: [3, 3] },
  room: { label: 'Raum', text: 'Ein einzelner Raum als Kachel; ein Tipp öffnet den Raum.', size: [2, 2], min: [2, 2] },
  scenes: { label: 'Szenen', text: 'Knöpfe für alle Szenen.', size: [4, 2], min: [2, 2] },
  lights: { label: 'Eingeschaltete Lichter', text: 'Alle Lichter, die gerade an sind, mit „Alle aus“.', size: [6, 4], min: [3, 3], options: { compact: false } },
  devices: { label: 'Geräte', text: 'Ausgewählte Geräte zum direkten Bedienen, auf Wunsch als kleine Schalter.', size: [4, 4], min: [2, 2], options: { title: '', devices: [], compact: false } },
  text: { label: 'Text', text: 'Überschrift und freier Text, z. B. als Notiz oder zum Gliedern.', size: [4, 2], min: [1, 1], options: { title: 'Notiz', text: '' } },
  printer: { label: '3D-Drucker', text: 'Zustand, Fortschritt, Restzeit, Temperaturen und Webcam-Bild des 3D-Druckers (OctoPrint oder Bambu Lab).', size: [6, 4], min: [3, 3], options: { webcam: true } },
  spotify: { label: 'Spotify', text: 'Mini-Player mit Titel, Fortschritt, Steuerung und Lautstärke – erscheint nur, solange Musik läuft.', size: [6, 3], min: [3, 3] },
  waste: { label: 'Müllabfuhr', text: 'Die nächsten Abholtermine aus dem Abfuhrkalender (ICS), farbig nach Tonne.', size: [4, 3], min: [2, 2], options: { count: 4 } },
  ventilation: { label: 'Lüften', text: 'Lüftungsempfehlung je Raum aus Luftfeuchte, CO₂ und Außenluft.', size: [4, 4], min: [2, 2] },
  kiosk: { label: 'Kiosk-Sensoren', text: 'CO₂-Ampel, Temperatur, Luftfeuchte, Helligkeit und Präsenz der Wanddisplays.', size: [6, 4], min: [3, 3] },
  extension: { label: 'Externes Modul', text: 'Das Widget eines installierten externen Moduls (Einstellungen → Module).', size: [4, 3], min: [1, 1], options: { extension: '' } },
};

export const WIDGET_TYPES = Object.keys(WIDGETS) as WidgetType[];

/**
 * True if the content of the widget grows with a widget that is larger than its content (see
 * lib/fit.ts). Not for widgets that fill their area by themselves (gauges, Home Core, camera
 * pictures, the energy flow without curve, the rain radar, external modules) or where it was switched off.
 */
export function scalesContent(w: { type: WidgetType; options: WidgetOptions }): boolean {
  if (w.type === 'status' || w.type === 'gauge' || w.type === 'camera' || w.type === 'extension') return false;
  if (w.type === 'energy' && !w.options.chart) return false;
  if (w.type === 'weatherPart' && w.options.part === 'radar') return false;
  return w.options.scale !== false;
}

const int = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Position and size kept inside the grid and not below the widget's smallest size. */
export function clampRect(r: GridRect, type?: WidgetType): GridRect {
  const [minW, minH] = type ? WIDGETS[type].min : [1, 1];
  const w = int(r.w, minW, GRID_COLS, minW);
  const h = int(r.h, minH, MAX_HEIGHT, minH);
  return { x: int(r.x, 0, GRID_COLS - w, 0), y: int(r.y, 0, MAX_ROWS - h, 0), w, h };
}

/** True if two rectangles share at least one cell. */
export const overlaps = (a: GridRect, b: GridRect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Number of rows in use (bottom edge of the lowest widget). */
export const gridRows = (widgets: GridRect[]) => widgets.reduce((n, w) => Math.max(n, w.y + w.h), 0);

/**
 * Lets the widgets make room: from top to bottom, every widget that overlaps one placed before it
 * moves down just below it. `fixed` (the widget that is being moved) keeps its place.
 */
export function resolveCollisions(widgets: Widget[], fixed?: string): Widget[] {
  const first = widgets.find((w) => w.id === fixed);
  const rest = widgets.filter((w) => w !== first).sort((a, b) => a.y - b.y || a.x - b.x);
  const placed: Widget[] = first ? [first] : [];
  const moved = new Map<string, Widget>(first ? [[first.id, first]] : []);
  for (const w of rest) {
    let y = w.y;
    for (let hit = placed.find((p) => overlaps(p, { ...w, y })); hit; hit = placed.find((p) => overlaps(p, { ...w, y }))) y = hit.y + hit.h;
    const next = y === w.y ? w : { ...w, y };
    placed.push(next);
    moved.set(w.id, next);
  }
  // keep the original order of the list (it is also the order of keyboard navigation)
  return widgets.map((w) => moved.get(w.id)!);
}

/** Moves and / or resizes one widget; widgets in the way move down. Returns the original list if nothing changes. */
export function placeWidget(widgets: Widget[], id: string, rect: GridRect): Widget[] {
  const w = widgets.find((x) => x.id === id);
  if (!w) return widgets;
  const r = clampRect(rect, w.type);
  if (r.x === w.x && r.y === w.y && r.w === w.w && r.h === w.h) return widgets;
  return resolveCollisions(widgets.map((x) => (x === w ? { ...x, ...r } : x)), id);
}

/** Top-most, then left-most free place for a `w` × `h` widget (below everything if the grid is full). */
export function findFreeSpot(widgets: GridRect[], w: number, h: number): { x: number; y: number } {
  const rows = gridRows(widgets);
  for (let y = 0; y <= rows; y++) {
    for (let x = 0; x + w <= GRID_COLS; x++) {
      if (!widgets.some((o) => overlaps(o, { x, y, w, h }))) return { x, y };
    }
  }
  return { x: 0, y: rows };
}

/** Id that is not used by another widget yet. */
export function widgetId(type: string, widgets: { id: string }[]) {
  const taken = new Set(widgets.map((w) => w.id));
  let i = 1;
  while (taken.has(`${type}-${i}`)) i++;
  return `${type}-${i}`;
}

/**
 * Adds a widget of the given type in its default size (or that of the chosen part, or `size`, e.g. the
 * size an external module asks for) at the first free place.
 */
export function addWidget(widgets: Widget[], type: WidgetType, options: WidgetOptions = {}, size?: [number, number]): Widget[] {
  if (widgets.length >= MAX_WIDGETS) return widgets;
  const info = WIDGETS[type];
  const opts = { ...info.options, ...options };
  const [w0, h0] = size ?? widgetPart({ type, options: opts })?.size ?? info.size;
  const r = clampRect({ x: 0, y: 0, w: w0, h: h0 }, type);
  const { x, y } = findFreeSpot(widgets, r.w, r.h);
  return [...widgets, { id: widgetId(type, widgets), type, x, y, w: r.w, h: r.h, options: opts }];
}

/** Widgets in reading order (top to bottom, left to right) for the one-column layout of phones. */
export const readingOrder = <T extends GridRect>(widgets: T[]): T[] => [...widgets].sort((a, b) => a.y - b.y || a.x - b.x);

/** Valid start page from the configuration (tolerates missing or broken data, overlapping widgets move down). */
export function normalizeDashboard(d: unknown): Widget[] {
  const list = d && typeof d === 'object' && Array.isArray((d as CustomDashboard).widgets) ? (d as CustomDashboard).widgets : [];
  const widgets: Widget[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object' || !WIDGET_TYPES.includes(raw.type) || widgets.length >= MAX_WIDGETS) continue;
    const id = typeof raw.id === 'string' && raw.id && !widgets.some((w) => w.id === raw.id) ? raw.id : widgetId(raw.type, widgets);
    const options = raw.options && typeof raw.options === 'object' && !Array.isArray(raw.options) ? raw.options : {};
    widgets.push({ id, type: raw.type, ...clampRect(raw, raw.type), options });
  }
  return resolveCollisions(widgets);
}

/** Starting point for a new start page: roughly the standard overview, ready to be rearranged. */
export function templateWidgets(): Widget[] {
  const w = (id: string, type: WidgetType, x: number, y: number, width: number, h: number, options: WidgetOptions = {}): Widget =>
    ({ id, type, x, y, w: width, h, options: { ...WIDGETS[type].options, ...options } });
  return [
    w('clock-1', 'clock', 0, 0, 5, 3),
    w('status-1', 'status', 5, 0, 3, 3),
    w('weather-1', 'weather', 8, 0, 4, 3),
    w('gauge-1', 'gauge', 0, 3, 3, 3, { kind: 'solar' }),
    w('gauge-2', 'gauge', 3, 3, 3, 3, { kind: 'autarky' }),
    w('gauge-3', 'gauge', 6, 3, 3, 3, { kind: 'climate' }),
    w('gauge-4', 'gauge', 9, 3, 3, 3, { kind: 'lights' }),
    w('energy-1', 'energy', 0, 6, 6, 6),
    w('security-1', 'security', 6, 6, 6, 6),
    w('rooms-1', 'rooms', 0, 12, 12, 4),
    w('scenes-1', 'scenes', 0, 16, 12, 2),
  ];
}
