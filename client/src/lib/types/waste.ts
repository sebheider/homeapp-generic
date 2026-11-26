/** Waste collection calendar. */

/** Waste collection calendar (see server waste.js). */
export interface WasteConfig {
  enabled: boolean;
  url: string;
  /** "HH:MM" on the evening before a pickup. */
  remindFrom: string;
  /** "HH:MM" on the pickup day. */
  remindUntil: string;
  severity: 'warning' | 'info';
  /** Kind keys without hints. */
  hidden: string[];
}

/** One kind of waste of a pickup. */
export interface WasteItem {
  summary: string;
  key: string;
  label: string;
  color: string;
}

/** A pickup day. */
export interface WasteDay {
  date: string;
  items: WasteItem[];
}

/** Upcoming pickups as pushed by the server. */
export interface WasteData {
  enabled: boolean;
  demo: boolean;
  error: string | null;
  fetchedAt: number | null;
  /** Last date of the calendar ('YYYY-MM-DD'). */
  last: string | null;
  upcoming: WasteDay[];
  /** Only from GET /api/waste. */
  kinds?: (WasteItem & { upcoming: number })[];
}
