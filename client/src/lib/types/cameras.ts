/** Cameras (Surveillance Station), detections and the rules of the camera pop-up. */

/** Per-camera overrides stored in the configuration (the camera list itself comes from the Surveillance Station). */
export interface CameraConfig {
  id: string;
  name?: string;
  room?: string | null;
  hidden?: boolean;
  /** Master switch for pop-ups of this camera. */
  popup?: boolean;
  /** Pop-up for normal motion / for advanced detection (people). */
  popupMotion?: boolean;
  popupPeople?: boolean;
  /** ioBroker datapoints of detectors mapped to this camera. */
  motionState?: string | null;
  peopleState?: string | null;
}

/** Camera as reported by the server (Surveillance Station list merged with the overrides). */
export interface CameraInfo {
  id: string;
  name: string;
  room: string | null;
  enabled: boolean;
  popup: boolean;
  popupMotion: boolean;
  popupPeople: boolean;
  motionState: string | null;
  peopleState: string | null;
}

/** Connection to the Synology Surveillance Station. The password is write-only (`passwordSet` tells whether one is stored). */
export interface SurveillanceConfig {
  enabled: boolean;
  host: string;
  port: number;
  https: boolean;
  account: string;
  password?: string;
  passwordSet?: boolean;
  /** One-time 2-factor code, only sent when saving; never stored. */
  otp?: string;
  /** True once DSM issued a device token (no code needed any more). */
  deviceIdSet?: boolean;
  resetDeviceId?: boolean;
  verifySsl: boolean;
  pollSeconds: number;
  motionCooldownSeconds: number;
  eventReasons: string;
  /** Reason codes that count as advanced detection (people). */
  peopleReasons: string;
}

/** Where the camera pop-up appears. */
export type PopupPosition = 'center' | 'corner';
/** Size of the camera pop-up. */
export type PopupSize = 'medium' | 'large' | 'full';

/** Kind of detection: normal motion or advanced detection (people). */
export type MotionKind = 'motion' | 'people';

/** Weekly time window (see server popup-rules.js inWindow): may run over midnight, from = to = whole day. */
export interface TimeWindow {
  /** JavaScript weekdays: 0 = Sunday ... 6 = Saturday; empty = every day. */
  days: number[];
  /** "HH:MM" */
  from: string;
  to: string;
}

/** Schedule rule for the camera pop-ups: when may which kind of detection pop up (see server popup-rules.js). */
export interface PopupRule {
  id: string;
  name: string;
  enabled: boolean;
  kinds: MotionKind[];
  /** JavaScript weekdays: 0 = Sunday ... 6 = Saturday. */
  days: number[];
  /** "HH:MM"; the window may run over midnight (from > to). */
  from: string;
  to: string;
  /** Camera ids; empty = all cameras. */
  cameras: string[];
}

/** German display names of the detection kinds. */
export const MOTION_LABEL: Record<MotionKind, string> = { motion: 'Bewegung', people: 'Person erkannt' };

/** Detection reported by a camera (`popup` = the server decided it may pop up). */
export interface MotionEvent {
  cameraId: string;
  name: string;
  ts: number;
  source: string;
  kind: MotionKind;
  reason: string | number | null;
  popup: boolean;
}
