/** Notifications: alert rules, active alerts and push notifications via Pushover. */

/** Severity of a notification (sorting, colour, icon). */
export type Severity = 'alarm' | 'warning' | 'info';
/** Comparison of an alert rule (see server alerts.js). */
export type AlertOp = '>' | '>=' | '<' | '<=' | '==' | '!=' | 'on' | 'off';

/** User-defined notification rule: watches one datapoint (see server alerts.js). */
export interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  /** ioBroker state id that is watched. */
  state: string;
  op: AlertOp;
  /** Limit / comparison value (unused for 'on' / 'off'). */
  value: number | string;
  /** Numeric rules: distance the value must move back before the alert clears. */
  hysteresis: number;
  /** The condition must hold this long before the alert is raised. */
  delaySeconds: number;
  severity: Severity;
  /** Text shown to the user; `{value}` is replaced by the current value. */
  message: string;
  /** Page (and room) a click on the notification jumps to; '' = none. */
  view: string;
  room: string;
  /** Stays visible until acknowledged, even after the condition is gone (default for alarms). */
  requireAck: boolean;
  /** Also sent as push notification (Pushover); missing = yes. */
  push?: boolean;
}

/** A notification that is currently active (pushed by the server). */
export interface ActiveAlert {
  id: string;
  name: string;
  severity: Severity;
  message: string;
  value: unknown;
  /** Time the alert was raised (ms). */
  since: number;
  view: string | null;
  room: string | null;
  /** Must be acknowledged ("quittiert"); `acked` tells whether that happened. */
  requireAck?: boolean;
  acked?: boolean;
  ackedAt?: number | null;
  /** The condition is gone, the alert only waits for its acknowledgement. */
  cleared?: boolean;
  clearedAt?: number | null;
  /** Generated hint instead of a user rule. */
  source?: 'waste' | 'ventilation';
}

/** Kinds of events that can be sent as push notification (see server pushover.js). */
export type PushEvent =
  | 'alarm' | 'warning' | 'info' | 'cleared' | 'waste' | 'ventilation'
  | 'printerDone' | 'printerError' | 'printerCancelled' | 'printerPaused' | 'printerProgress' | 'people' | 'motion';

/** Pushover priority: -2 no notification, -1 silent, 0 normal, 1 high, 2 emergency (repeated until confirmed). */
export type PushPriority = -2 | -1 | 0 | 1 | 2;

/**
 * Push notifications via Pushover. User key and API token are write-only: the server only reports
 * `userSet` / `tokenSet`; an empty field keeps the stored value.
 */
export interface PushoverConfig {
  enabled: boolean;
  user?: string;
  userSet?: boolean;
  token?: string;
  tokenSet?: boolean;
  /** Device name(s), comma separated; empty = all devices. */
  device: string;
  /** Pushover sound; empty = default of the account. */
  sound: string;
  /** Address of the app; notifications link to the matching page. */
  appUrl: string;
  /** 'HH:MM' (server time) or '' = no quiet hours. */
  quietFrom: string;
  quietUntil: string;
  /** Camera / printer webcam picture attached to camera and printer notifications. */
  attachImage: boolean;
  /** Camera notifications only when the pop-up would appear (pop-up switches and schedule). */
  cameraFollowPopup: boolean;
  /** Interval of the regular printer status updates (event `printerProgress`) in minutes, 5–720. */
  printerProgressMinutes: number;
  events: Record<PushEvent, { enabled: boolean; priority: PushPriority }>;
}

/** State of the push notifications (GET /api/pushover). */
export interface PushoverStatus {
  active: boolean;
  demo: boolean;
  lastSent: { ts: number; title: string; event: PushEvent } | null;
  lastError: { ts: number; message: string } | null;
}
