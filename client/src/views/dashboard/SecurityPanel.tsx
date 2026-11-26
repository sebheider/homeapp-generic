/** Security panel of the overview: camera pictures in HUD frames, activity timeline and doors / windows. */
import { DoorClosed, DoorOpen } from 'lucide-react';
import { useStore } from '../../lib/store';
import { clockTime, timeAgo } from '../../lib/format';
import { useNow } from '../../lib/hooks';
import type { Overview } from '../../lib/overview';
import { KIND_STYLE, KindIcon, SnapshotImage, motionKey, useRecentMotion } from '../../components/Cameras';
import { HudPanel, toneStyle } from '../../components/Hud';
import { MOTION_LABEL, type CameraInfo, type MotionEvent } from '../../lib/types';
import { C } from './colors';

/** Camera picture in a HUD frame (brackets, scan lines, LIVE marker); glows while something was detected. */
export function HudCamera({ cam }: { cam: CameraInfo }) {
  const refresh = useStore((s) => s.config?.app.snapshotRefreshSeconds ?? 3);
  const open = useStore((s) => s.openCamera);
  const evt = useRecentMotion(cam.id);
  const color = evt ? KIND_STYLE[evt.kind].color : C.violet;
  return (
    <button className="hud-cam text-left" style={{ ...toneStyle(color), boxShadow: evt ? `0 0 26px -6px ${color}` : undefined }} onClick={() => open(cam.id)}>
      <SnapshotImage id={cam.id} seconds={refresh} quality="low" className="absolute inset-0" />
      <i className="hud-frame" aria-hidden />
      <div className="absolute inset-x-0 top-0 z-[3] px-3 pt-2.5 pb-5 flex items-center gap-1.5 text-[0.68rem] font-semibold text-white bg-gradient-to-b from-black/65 to-transparent">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 anim-breathe" />
        <span className="truncate">{cam.name}</span>
        <span className="ml-auto opacity-70 tracking-[0.2em]">LIVE</span>
      </div>
      {evt && (
        <div className="absolute bottom-2 left-2 z-[3] hud-chip !text-[0.65rem] !py-0.5 backdrop-blur" style={toneStyle(color)}>
          <KindIcon kind={evt.kind} size={11} /> {MOTION_LABEL[evt.kind]} {timeAgo(evt.ts)}
        </div>
      )}
    </button>
  );
}

/** Timeline of the motion events of the last hours; the newest one pulses. */
function ActivityTimeline({ events, now, hours = 6, hideEmpty = false }: { events: MotionEvent[]; now: number; hours?: number; hideEmpty?: boolean }) {
  const from = now - hours * 3600e3;
  // newest first: everything up to the first older event
  const end = events.findIndex((e) => e.ts < from);
  const list = end < 0 ? events : events.slice(0, end);
  if (hideEmpty && !list.length) return null;
  return (
    <div className="hud-activity mt-3">
      <div className="flex justify-between text-[0.65rem] uppercase tracking-[0.18em] text-muted mb-1.5">
        <span>Aktivität · {hours} h</span>
        <span>{list.length} {list.length === 1 ? 'Ereignis' : 'Ereignisse'}</span>
      </div>
      <div className="relative h-9 rounded-xl overflow-hidden border border-line" style={{ background: 'color-mix(in srgb, var(--tone) 7%, transparent)' }}>
        {Array.from({ length: hours - 1 }, (_, i) => <i key={i} className="absolute top-0 bottom-0 w-px bg-[var(--line)]" style={{ left: `${((i + 1) / hours) * 100}%` }} />)}
        {list.map((e, i) => {
          const c = KIND_STYLE[e.kind].color;
          const size = e.kind === 'people' ? 10 : 8;
          return (
            <span
              key={motionKey(e)}
              title={`${MOTION_LABEL[e.kind]} · ${e.name} · ${clockTime(e.ts)}`}
              className={`absolute top-1/2 rounded-full ${i === 0 ? 'anim-ring' : ''}`}
              style={{ ...toneStyle(c), left: `${Math.min(98.5, ((e.ts - from) / (now - from)) * 100)}%`, width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2, background: c, boxShadow: `0 0 10px ${c}` }}
            />
          );
        })}
        <i className="absolute right-0 top-0 bottom-0 w-0.5 anim-breathe" style={{ background: 'var(--tone)', boxShadow: '0 0 8px var(--tone)' }} />
      </div>
      <div className="flex justify-between text-[0.6rem] text-muted mt-1">
        <span>−{hours} h</span>
        <span>jetzt</span>
      </div>
    </div>
  );
}

/** Cameras, activity and doors / windows; turns red while something moves. Compact: only open doors / windows. */
export function SecurityPanel({ contacts, compact = false }: { contacts: Overview['contacts']; compact?: boolean }) {
  const cameras = useStore((s) => s.cameras);
  const events = useStore((s) => s.motion);
  const now = useNow(15000);
  // newest first: the latest event decides
  const recent = events.length > 0 && now - events[0].ts < 60000;
  const shownContacts = compact ? contacts.filter((c) => c.open) : contacts;
  return (
    <HudPanel
      title="Sicherheit"
      color={recent ? C.alert : C.violet}
      right={cameras.length ? `${cameras.length} ${cameras.length === 1 ? 'Kamera' : 'Kameras'}` : undefined}
      className={compact ? `kiosk-security h-full min-h-0 flex flex-col ${shownContacts.length ? 'has-contacts' : ''}` : 'h-full'}
      bodyClassName={compact ? 'flex-1 min-h-0 flex flex-col justify-center' : ''}
    >
      {cameras.length > 0 && (
        <div className={`grid grid-cols-2 gap-2 sm:gap-3 ${compact ? 'kiosk-cams' : ''}`}>
          {cameras.slice(0, 4).map((c) => <HudCamera key={c.id} cam={c} />)}
        </div>
      )}
      {/* kiosk: an empty timeline leaves its room to the cameras */}
      <ActivityTimeline events={events} now={now} hideEmpty={compact} />
      {shownContacts.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {shownContacts.map(({ d, open }) => (
            <span key={d.id} className="hud-chip" style={toneStyle(open ? C.alert : C.green)}>
              {open ? <DoorOpen size={12} /> : <DoorClosed size={12} />} {d.name} {open ? 'offen' : 'zu'}
            </span>
          ))}
        </div>
      )}
    </HudPanel>
  );
}
