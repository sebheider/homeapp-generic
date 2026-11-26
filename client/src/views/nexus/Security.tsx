/** Cameras, doors / windows and detections in the "Nexus" design. */
import { DoorClosed, DoorOpen } from 'lucide-react';
import { useStore } from '../../lib/store';
import { timeAgo } from '../../lib/format';
import { useNow } from '../../lib/hooks';
import type { Overview } from '../../lib/overview';
import { MOTION_LABEL, type CameraInfo, type MotionEvent } from '../../lib/types';
import { recentMotionCameras } from '../../lib/cameraPopups';
import { KindIcon, SnapshotImage, useRecentMotion } from '../../components/Cameras';
import { NX } from '../../components/HomeTwin';
import { tc, Panel } from './Panel';

const CAM_CLOCK = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Live clock for the camera overlays (keeps the per-second re-render out of the picture). */
function CamClock() {
  const now = useNow(1000);
  return <span className="nx-ts">{CAM_CLOCK.format(now).replace(',', ' ·')}</span>;
}

/** Camera picture with reticle, LIVE marker and a badge while something was detected. */
function NexusCam({ cam, refresh, event }: { cam: CameraInfo; refresh: number; event?: MotionEvent }) {
  const open = useStore((s) => s.openCamera);
  const recent = useRecentMotion(cam.id);
  const evt = event ?? recent;
  return (
    <button className={`nx-cam ${evt ? 'alert' : ''}`} onClick={() => open(cam.id)} aria-label={`Kamera ${cam.name}`}>
      <SnapshotImage id={cam.id} seconds={refresh} quality="low" className="absolute inset-0" />
      <i className="nx-ret" />
      <span className="nx-cam-ov">
        <span className="a"><span>{cam.name}</span><span className="nx-live-tag">Live</span></span>
        {evt ? <span className="nx-det"><KindIcon kind={evt.kind} size={10} /> {MOTION_LABEL[evt.kind]}{event ? ` · ${timeAgo(evt.ts)}` : ''}</span> : <CamClock />}
      </span>
    </button>
  );
}

/** Cameras, doors / windows and the last detection. */
export function Security({ o, fill }: { o: Overview; fill: boolean }) {
  const cameras = useStore((s) => s.cameras);
  const last = useStore((s) => s.motion[0]);
  const refresh = useStore((s) => s.config?.app.snapshotRefreshSeconds ?? 3);
  useNow(30000);
  if (!cameras.length && !o.contacts.length) return null;
  // kiosk: only open doors / windows, so the cameras keep their space
  const contacts = [...o.contacts].filter((c) => !fill || c.open).sort((a, b) => Number(b.open) - Number(a.open)).slice(0, fill ? 2 : 8);
  const openCount = o.openContacts.length;
  return (
    <Panel title="Sicherheit" right={cameras.length ? `${cameras.length} ${cameras.length === 1 ? 'KAMERA' : 'KAMERAS'}` : openCount ? `${openCount} OFFEN` : 'ALLES ZU'} to="cameras" color={openCount ? NX.amber : NX.violet} className="nx-grow">
      {cameras.length > 0 && <div className="nx-cams">{cameras.slice(0, 4).map((c) => <NexusCam key={c.id} cam={c} refresh={refresh} />)}</div>}
      {contacts.length > 0 && (
        <div className="nx-access">
          {contacts.map(({ d, open }) => (
            <div key={d.id} className="nx-acc" style={tc(open ? NX.amber : NX.green)}>
              {open ? <DoorOpen size={15} /> : <DoorClosed size={15} />}
              <span>{d.name}</span>
              <em>{open ? 'OFFEN' : 'ZU'}</em>
            </div>
          ))}
        </div>
      )}
      {last && !fill && (
        <div className="nx-last">
          <span style={{ color: NX.amber }}>◆</span> Letzte Erkennung: <b>{MOTION_LABEL[last.kind]} · {last.name}</b> · {timeAgo(last.ts)}
        </div>
      )}
    </Panel>
  );
}

/** Cameras with a detection whose pop-up closed only a while ago (see `recentMotionCameras`), newest first. */
export function useMotionCams() {
  const cameras = useStore((s) => s.cameras);
  const motion = useStore((s) => s.motion);
  const app = useStore((s) => s.config?.app);
  const now = useNow(5000);
  const seconds = { motion: app?.motionPopupSeconds ?? 30, people: app?.peoplePopupSeconds ?? 60 };
  return recentMotionCameras(motion, seconds, now)
    .map((event) => ({ event, cam: cameras.find((c) => c.id === event.cameraId) }))
    .filter((x): x is { event: MotionEvent; cam: CameraInfo } => Boolean(x.cam))
    .slice(0, 2);
}

/** Kiosk in portrait format: only after a detection (its cameras) or while doors / windows are open. */
export function Alerts({ o, cams }: { o: Overview; cams: { event: MotionEvent; cam: CameraInfo }[] }) {
  const refresh = useStore((s) => s.config?.app.snapshotRefreshSeconds ?? 3);
  if (!cams.length && !o.openContacts.length) return null;
  const open = o.openContacts.slice(0, cams.length ? 2 : 4);
  return (
    <Panel title="Sicherheit" right={cams.length ? 'BEWEGUNG' : `${o.openContacts.length} OFFEN`} to="cameras" color={NX.amber}>
      {cams.length > 0 && <div className={`nx-cams ${cams.length === 1 ? 'one' : ''}`}>{cams.map(({ cam, event }) => <NexusCam key={cam.id} cam={cam} refresh={refresh} event={event} />)}</div>}
      {open.length > 0 && (
        <div className="nx-access">
          {open.map((d) => (
            <div key={d.id} className="nx-acc" style={tc(NX.amber)}>
              <DoorOpen size={15} />
              <span>{d.name}</span>
              <em>OFFEN</em>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
