/** Live data of the server API: datapoint values, connection health, object search and history. */

/** Live value of a datapoint (`ack` = confirmed by the device). */
export interface StateEntry {
  val: unknown;
  ts: number;
  ack: boolean;
}

/** Connection health of the server's data sources. */
export interface Status {
  demo: boolean;
  source: { connected: boolean; error: string | null; objects: number };
  surveillance: {
    enabled: boolean;
    connected: boolean;
    error: string | null;
    cameras: number;
    /** How often each event reason code was seen (diagnostics for the people / motion mapping). */
    reasonStats?: Record<string, { count: number; last: number }>;
  };
  /** 3D printer (OctoPrint, Bambu Lab or the demo printer); missing with older servers. */
  printer?: { enabled: boolean; connected: boolean; error: string | null; demo: boolean };
  /** Spotify Connect (or the demo player); missing with older servers. */
  spotify?: { enabled: boolean; connected: boolean; error: string | null; demo: boolean; account: string | null };
}

/** Result of the ioBroker object search used by the datapoint picker. */
export interface ObjectHit {
  id: string;
  name: string;
  type?: string;
  role?: string;
  unit?: string;
  write?: boolean;
}

/** Time series as `[timestamp ms, value]` pairs. */
export type Series = [number, number][];
