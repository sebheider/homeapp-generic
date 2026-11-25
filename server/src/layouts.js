/**
 * Layout of the device pages "Licht", "Klima" and "Räume": how devices are grouped and ordered.
 *
 *   layouts: {
 *     lights:  { groupBy, groupOrder: [...], deviceOrder: [...], hidden: [...] },
 *     climate: { ... },
 *     rooms:   { ... }
 *   }
 *
 *   groupBy      'default' (built-in layout of the page), 'room', 'type' or 'none' (one list)
 *   groupOrder   group keys (room ids or type keys) in the wanted order; groups not listed follow
 *   deviceOrder  device ids in the wanted order; devices not listed follow in configuration order
 *   hidden       device ids that are not shown on this page
 */

export const LAYOUT_PAGES = ['lights', 'climate', 'rooms'];
export const GROUP_MODES = ['default', 'room', 'type', 'none'];

const ids = (v, max = 500) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string' && x).map((x) => x.slice(0, 120)))].slice(0, max) : []);

/** Cleans one page layout. */
export function sanitizeLayout(l = {}) {
  return {
    groupBy: GROUP_MODES.includes(l?.groupBy) ? l.groupBy : 'default',
    groupOrder: ids(l?.groupOrder, 100),
    deviceOrder: ids(l?.deviceOrder),
    hidden: ids(l?.hidden),
  };
}

/** Cleans the layouts of all pages (unknown pages are dropped, missing ones get the defaults). */
export function sanitizeLayouts(layouts = {}) {
  return Object.fromEntries(LAYOUT_PAGES.map((p) => [p, sanitizeLayout(layouts?.[p])]));
}
