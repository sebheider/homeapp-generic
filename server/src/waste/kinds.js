/**
 * Kinds of waste: short label, stable key and bin colour of a pickup.
 */

/** Kinds of waste recognised by keyword (first match wins), with a colour for the bin symbol. */
const KINDS = [
  { key: 'rest', re: /rest|hausm(ü|ue)ll|schwarz|grau/i, color: '#6b7280' },
  { key: 'bio', re: /bio|kompost|gr(ü|ue)nschnitt|garten|braun/i, color: '#92400e' },
  { key: 'paper', re: /papier|pappe|karton|ppk|blau/i, color: '#2563eb' },
  { key: 'yellow', re: /gelb|wertstoff|verpackung|leichtverp|lvp/i, color: '#eab308' },
  { key: 'glass', re: /glas/i, color: '#16a34a' },
  { key: 'bulky', re: /sperr|elektro/i, color: '#ea580c' },
  { key: 'hazard', re: /schadstoff|sonderm(ü|ue)ll|problem/i, color: '#dc2626' },
  { key: 'tree', re: /weihnachts|tannen|baum/i, color: '#15803d' },
];
const OTHER_COLOR = '#64748b';

/** "Restmülltonne 2-wö." -> "Restmülltonne"; "Wertstofftonne oder -sack 4-wö." -> "Wertstofftonne". */
export function shortLabel(summary) {
  const s = String(summary || '')
    .replace(/\s*\(?\d+\s*-?\s*w(ö|oe)(ch)?\.?(entlich)?\)?/gi, '')
    .replace(/\s+regelabfuhr/gi, '')
    .replace(/\s+oder\s+-?\s*sack/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s || String(summary || '').trim() || 'Abholung';
}

/** Kind key and colour of a pickup; `key` is stable for the "hidden" setting (unknown kinds use their label). */
export function wasteKind(summary) {
  const label = shortLabel(summary);
  const k = KINDS.find((x) => x.re.test(label));
  return { key: k ? k.key : `x:${label.toLowerCase().slice(0, 40)}`, label, color: k ? k.color : OTHER_COLOR };
}
