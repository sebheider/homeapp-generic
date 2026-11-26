import type { MotionEvent } from './types';

export const CAMERA_POPUP_PAUSE_MINUTES = [15, 30, 60, 120, 240, 480] as const;
export const CAMERA_POPUP_PAUSE_KEY = 'cameraPopupsSuppressedUntil';

/** The pause belongs to this browser and survives a page reload. */
export function loadCameraPopupPause(now = Date.now()): number {
  try {
    const until = Number(localStorage.getItem(CAMERA_POPUP_PAUSE_KEY));
    return Number.isSafeInteger(until) && until > now && until <= 8.64e15 ? until : 0;
  } catch {
    return 0;
  }
}

export function saveCameraPopupPause(until: number) {
  try {
    if (until) localStorage.setItem(CAMERA_POPUP_PAUSE_KEY, String(until));
    else localStorage.removeItem(CAMERA_POPUP_PAUSE_KEY);
  } catch {
    /* The pause still works for this session if storage is unavailable. */
  }
}

/** Suppressed events stay in the history; only new events after expiry may pop up. */
export function shouldShowCameraPopup(event: MotionEvent, current: MotionEvent | null, suppressedUntil: number, now = Date.now()) {
  return event.popup && now >= suppressedUntil && !(current?.kind === 'people' && event.kind !== 'people');
}

/** After its pop-up closed, a camera stays on the kiosk overview for this long. */
const CAMERA_HOLD_SECONDS = 180;

/**
 * Cameras (newest first, each once) whose pop-up-worthy detection is still recent: shown for the
 * pop-up time of its kind plus `holdSeconds`. `events` are newest first, as in the store.
 */
export function recentMotionCameras(
  events: MotionEvent[],
  seconds: { motion: number; people: number },
  now = Date.now(),
  holdSeconds = CAMERA_HOLD_SECONDS,
): MotionEvent[] {
  const out = new Map<string, MotionEvent>();
  for (const e of events) {
    if (!e.popup) continue;
    const until = e.ts + ((e.kind === 'people' ? seconds.people : seconds.motion) + holdSeconds) * 1000;
    if (until <= now || e.ts > now + 60_000) continue;
    const seen = out.get(e.cameraId);
    // a person detection outranks a plain motion of the same camera
    if (!seen || (seen.kind !== 'people' && e.kind === 'people')) out.set(e.cameraId, seen && e.kind === 'people' ? { ...e, ts: Math.max(e.ts, seen.ts) } : e);
  }
  return [...out.values()];
}
