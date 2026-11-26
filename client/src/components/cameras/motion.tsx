/** Detections of the cameras: recent motion of a camera, colours, keys and icons per kind of detection. */
import { PersonStanding, Radio } from 'lucide-react';
import { useStore } from '../../lib/store';
import { useNow } from '../../lib/hooks';
import type { MotionEvent, MotionKind } from '../../lib/types';

/** True if the camera reported motion during the last minute; a person event wins over normal motion. */
export function useRecentMotion(cameraId: string, windowMs = 60000) {
  const events = useStore((s) => s.motion);
  // re-render every 5 s so the badge disappears once the event is older than the window
  useNow(5000);
  // the history is sorted newest first: stop at the first event outside the window
  const since = Date.now() - windowMs;
  let first: MotionEvent | null = null;
  for (const m of events) {
    if (m.ts < since) break;
    if (m.cameraId !== cameraId) continue;
    if (m.kind === 'people') return m;
    first ??= m;
  }
  return first;
}

/** Colour and tone class per kind of detection. */
export const KIND_STYLE: Record<MotionKind, { color: string; tone: string }> = {
  motion: { color: '#38bdf8', tone: 'tone-cool' },
  people: { color: '#f43f5e', tone: 'tone-alert' },
};

/** Stable React key of a motion event. */
export const motionKey = (e: MotionEvent) => `${e.cameraId}-${e.ts}-${e.kind}`;

/** Icon of a kind of detection (person / radio waves). */
export function KindIcon({ kind, size = 14, className = '' }: { kind: MotionKind; size?: number; className?: string }) {
  return kind === 'people' ? <PersonStanding size={size} className={className} /> : <Radio size={size} className={className} />;
}

/** `KindIcon` in the colour of its kind, used in motion event lists. */
export function ColoredKindIcon({ kind, size }: { kind: MotionKind; size: number }) {
  return <span style={{ color: KIND_STYLE[kind].color }} className="shrink-0"><KindIcon kind={kind} size={size} /></span>;
}
