/**
 * Camera components: self-refreshing snapshot, live stream (MJPEG with snapshot fallback), camera tile with motion badge,
 * fullscreen viewer and the motion pop-up. Pictures come from the server, which proxies
 * the Synology Surveillance Station.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, motion, useIsPresent } from 'motion/react';
import { BellOff, CameraOff, Expand, PersonStanding, Radio, X } from 'lucide-react';
import { snapshotPath, streamUrl, type SnapshotQuality } from '../lib/api';
import { useStore } from '../lib/store';
import { useNow } from '../lib/hooks';
import { useMedia } from '../lib/display';
import { timeAgo } from '../lib/format';
import { CAMERA_POPUP_PAUSE_KEY, CAMERA_POPUP_PAUSE_MINUTES, loadCameraPopupPause } from '../lib/cameraPopups';
import { MOTION_LABEL, type CameraInfo, type MotionEvent, type MotionKind, type PopupPosition, type PopupSize } from '../lib/types';
import { Modal, useStaticVisuals } from './ui';

/**
 * Picture that refreshes itself every `seconds` from `url` (an address without cache buster).
 * The next frame is loaded in the background and swapped in once it is complete,
 * so the image never flickers. Refreshing pauses while the tab is hidden.
 * `fit`: crop to the box (cover) or show it completely (contain); `imgStyle` e.g. mirrors the picture.
 */
export function RefreshingImage({ url, seconds, className = '', fit = 'cover', imgStyle }: {
  url: string; seconds: number; className?: string; fit?: 'cover' | 'contain'; imgStyle?: CSSProperties;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: number;
    const load = () => {
      if (document.hidden) {
        timer = window.setTimeout(load, 1000);
        return;
      }
      const next = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
      const img = new Image();
      img.onload = () => {
        if (!alive) return;
        setSrc(next);
        setFailed(false);
        // at least every 0.5 s, so a broken setting cannot flood the server
        timer = window.setTimeout(load, Math.max(0.5, seconds) * 1000);
      };
      img.onerror = () => {
        if (!alive) return;
        setFailed(true);
        // retry more slowly after an error (at least every 5 s)
        timer = window.setTimeout(load, Math.max(5, seconds) * 1000);
      };
      img.src = next;
    };
    load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [url, seconds]);

  if (!src) {
    return (
      <div className={`grid place-items-center bg-black/30 text-muted ${className}`}>
        {failed ? <CameraOff size={32} /> : <div className="skeleton absolute inset-0" />}
      </div>
    );
  }
  return (
    <div className={`relative bg-black overflow-hidden ${className}`}>
      <img src={src} alt="" className={`w-full h-full ${fit === 'contain' ? 'object-contain' : 'object-cover'}`} style={imgStyle} draggable={false} />
      {failed && (
        <div className="absolute inset-0 grid place-items-center bg-black/60 text-white/80 text-xs gap-1">
          <CameraOff size={24} />
          Verbindung verloren
        </div>
      )}
    </div>
  );
}

/** Camera picture of the Surveillance Station that refreshes itself (see `RefreshingImage`). */
export function SnapshotImage({ id, seconds, quality = 'balanced', className = '' }: { id: string; seconds: number; quality?: SnapshotQuality; className?: string }) {
  return <RefreshingImage url={snapshotPath(id, quality)} seconds={seconds} className={className} />;
}

/** 1×1 transparent GIF: assigning it to an <img> cancels a running MJPEG download. */
const BLANK_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
/** After a failed stream, the fallback pictures are shown this long before the stream is tried again. */
const STREAM_RETRY_MS = 30000;

/** True while the browser tab is visible. */
function usePageVisible() {
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return visible;
}

/**
 * Smooth live video: shows the MJPEG stream at `url` (the server shares one camera connection between
 * all viewers). Shows `fallback` (refreshing pictures) if the stream cannot be opened and tries the
 * stream again every 30 s. The connection is closed while the tab is hidden and on unmount.
 */
export function StreamImage({ url, fallback, className = '', fit = 'cover', imgStyle }: {
  url: string; fallback: ReactNode; className?: string; fit?: 'cover' | 'contain'; imgStyle?: CSSProperties;
}) {
  const visible = usePageVisible();
  // browsers do not report an MJPEG stream that ended, so it is opened again whenever the push channel
  // reconnects (e.g. after a server restart); a dropped camera connection is restored by the server
  const online = useStore((s) => s.wsConnected);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const ref = useRef<HTMLImageElement>(null);
  const wasOnline = useRef<boolean | null>(null);

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [url]);
  useEffect(() => {
    if (online && wasOnline.current === false) setAttempt((a) => a + 1);
    if (online || wasOnline.current !== null) wasOnline.current = online;
  }, [online]);
  useEffect(() => {
    if (!failed) return;
    const t = setTimeout(() => {
      setFailed(false);
      setAttempt((a) => a + 1);
    }, STREAM_RETRY_MS);
    return () => clearTimeout(t);
  }, [failed]);
  // native listeners and an explicit cancel, so an aborted stream never counts as a failure
  useEffect(() => {
    const img = ref.current;
    if (!img || failed || !visible) return;
    let alive = true;
    const onLoad = () => alive && setLoaded(true);
    const onError = () => alive && setFailed(true);
    img.addEventListener('load', onLoad);
    img.addEventListener('error', onError);
    img.src = `${url}${url.includes('?') ? '&' : '?'}s=${attempt}`;
    return () => {
      alive = false;
      img.removeEventListener('load', onLoad);
      img.removeEventListener('error', onError);
      img.src = BLANK_IMAGE;
    };
  }, [url, attempt, failed, visible]);

  if (failed) return <>{fallback}</>;
  return (
    <div className={`relative bg-black overflow-hidden ${className}`}>
      {!loaded && <div className="skeleton absolute inset-0" />}
      <img ref={ref} alt="" className={`w-full h-full ${fit === 'contain' ? 'object-contain' : 'object-cover'}`} style={imgStyle} draggable={false} />
    </div>
  );
}

/**
 * Live picture of a camera: the MJPEG stream of the Surveillance Station, with refreshing
 * snapshots (`seconds`, `quality`) while the stream is not available.
 */
export function LiveImage({ id, className = '', seconds = 1, quality = 'high' }: { id: string; className?: string; seconds?: number; quality?: SnapshotQuality }) {
  return <StreamImage url={streamUrl(id)} fallback={<SnapshotImage id={id} seconds={seconds} quality={quality} className={className} />} className={className} />;
}

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

/** Camera preview tile (refreshing snapshot); glows and shows a badge while motion was detected recently. */
export function CameraTile({ cam, onOpen }: { cam: CameraInfo; onOpen: () => void }) {
  const still = useStaticVisuals();
  const refresh = useStore((s) => s.config?.app.snapshotRefreshSeconds ?? 3);
  const motionEvt = useRecentMotion(cam.id);
  const style = motionEvt ? KIND_STYLE[motionEvt.kind] : null;
  return (
    <motion.button
      layout={!still}
      onClick={onOpen}
      className={`glass tile interactive block w-full text-left overflow-hidden p-0 ${style ? `${style.tone} active` : ''}`}
      whileHover={still ? undefined : { y: -3 }}
    >
      <div className="relative aspect-video">
        <SnapshotImage id={cam.id} seconds={refresh} quality="low" className="absolute inset-0" />
        <div className="absolute inset-x-0 top-0 p-3 flex items-center gap-2 bg-gradient-to-b from-black/60 to-transparent text-white">
          <span className="w-2 h-2 rounded-full bg-red-500 anim-breathe" />
          <span className="text-sm font-semibold drop-shadow">{cam.name}</span>
          <Expand size={14} className="ml-auto opacity-70" />
        </div>
        {motionEvt && style && (
          <div className="absolute bottom-2 left-2 chip on anim-ring" style={{ ['--tone' as string]: style.color }}>
            <KindIcon kind={motionEvt.kind} size={13} /> {MOTION_LABEL[motionEvt.kind]} {timeAgo(motionEvt.ts)}
          </div>
        )}
      </div>
    </motion.button>
  );
}

/** Fullscreen camera viewer with live stream; arrow keys / buttons switch between cameras. */
export function CameraViewer() {
  const id = useStore((s) => s.focusCamera);
  const cams = useStore((s) => s.cameras);
  const open = useStore((s) => s.openCamera);
  const cam = cams.find((c) => c.id === id);
  const idx = cams.findIndex((c) => c.id === id);
  // cycles through the list in both directions
  const go = (d: number) => cams.length > 1 && open(cams[(idx + d + cams.length) % cams.length].id);

  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, idx, cams.length]);

  return (
    <Modal open={Boolean(cam)} onClose={() => open(null)} wide zoom>
      {cam && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="chip on !bg-red-500/90"><Radio size={13} className="anim-breathe" /> LIVE</span>
            <h2 className="text-lg font-semibold flex-1">{cam.name}</h2>
            {cams.length > 1 && (
              <>
                <button className="btn btn-icon" onClick={() => go(-1)} aria-label="Vorherige Kamera">‹</button>
                <button className="btn btn-icon" onClick={() => go(1)} aria-label="Nächste Kamera">›</button>
              </>
            )}
            <button className="btn btn-icon" onClick={() => open(null)} aria-label="Schließen"><X size={18} /></button>
          </div>
          <div className="rounded-2xl overflow-hidden aspect-video bg-black">
            <LiveImage key={cam.id} id={cam.id} className="w-full h-full" />
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * Width of the pop-up per size. Centred pop-ups are also limited by the screen height, so the
 * 16:9 picture plus controls always fits (10rem cover controls, progress bar and margins).
 */
export const POPUP_WIDTH: Record<PopupPosition, Record<PopupSize, string>> = {
  center: {
    medium: 'min(92vw, 40rem, calc((88dvh - 10rem) * 16 / 9))',
    large: 'min(94vw, 64rem, calc((90dvh - 10rem) * 16 / 9))',
    full: 'min(97vw, calc((95dvh - 10rem) * 16 / 9))',
  },
  corner: { medium: '26rem', large: 'min(36rem, 94vw)', full: 'min(48rem, 94vw)' },
};

/**
 * Temporary pop-up that shows the live picture of the camera that detected something.
 * Normal motion and advanced detection (people) look different (colour, icon, title) and
 * have their own display time. A progress bar shows the remaining time.
 * Position (centred dialog or corner window) and size come from the settings.
 */
export function MotionPopup() {
  const popup = useStore((s) => s.popup);
  const app = useStore((s) => s.config?.app);
  const override = useStore((s) => s.popupOverride);
  const dismiss = useStore((s) => s.dismissPopup);
  const openCam = useStore((s) => s.openCamera);
  const suppress = useStore((s) => s.suppressCameraPopups);
  const [pauseDialog, setPauseDialog] = useState(false);
  const kind: MotionKind = popup?.kind ?? 'motion';
  const seconds = override ? 8 : kind === 'people' ? app?.peoplePopupSeconds ?? 60 : app?.motionPopupSeconds ?? 30;
  const refresh = app?.popupSnapshotRefreshSeconds ?? 1;
  const live = app?.popupLiveVideo !== false;
  const position: PopupPosition = override?.position ?? app?.popupPosition ?? 'center';
  const size: PopupSize = override?.size ?? app?.popupSize ?? 'large';
  const eventKey = popup ? motionKey(popup) : null;

  // Only the current event owns a timer, never a retained exiting layer.
  useEffect(() => {
    if (!eventKey) return;
    const t = setTimeout(() => {
      const current = useStore.getState().popup;
      if (current && motionKey(current) === eventKey) dismiss();
    }, seconds * 1000);
    return () => clearTimeout(t);
  }, [eventKey, seconds, dismiss]);
  useEffect(() => {
    if (!eventKey) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismiss();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [eventKey, dismiss]);

  return (
    <>
      <AnimatePresence mode="wait">
        {popup && (
          <MotionPopupLayer
            key={`${eventKey}-${position}-${size}`}
            popup={popup}
            seconds={seconds}
            refresh={refresh}
            live={live}
            position={position}
            size={size}
            dismiss={dismiss}
            openCam={openCam}
            onSuppress={() => { dismiss(); setPauseDialog(true); }}
          />
        )}
      </AnimatePresence>
      <Modal open={pauseDialog} onClose={() => setPauseDialog(false)} title="Kamera Popups unterdrücken">
        <p className="text-sm text-muted mb-4">
          Wie lange sollen die Popups aller Kameras in diesem Browser unterdrückt werden?
          Danach werden neue Meldungen automatisch wieder eingeblendet. Bewegungen bleiben in der Historie sichtbar.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {CAMERA_POPUP_PAUSE_MINUTES.map((minutes) => (
            <button key={minutes} className="btn" onClick={() => { suppress(minutes); setPauseDialog(false); }}>
              {minutes < 60 ? `${minutes} Minuten` : minutes === 60 ? '1 Stunde' : `${minutes / 60} Stunden`}
            </button>
          ))}
        </div>
        <button className="btn mt-4" onClick={() => setPauseDialog(false)}>Abbrechen</button>
      </Modal>
    </>
  );
}

/** Remains above every page until the pause expires or is ended manually. */
export function CameraPopupPauseBanner() {
  const until = useStore((s) => s.cameraPopupsSuppressedUntil);
  const resume = useStore((s) => s.resumeCameraPopups);
  const now = useNow(1000);
  useEffect(() => {
    const reconcile = () => {
      const deadline = loadCameraPopupPause();
      useStore.setState({
        cameraPopupsSuppressedUntil: deadline,
        ...(deadline ? { popup: null, popupOverride: null } : {}),
      });
    };
    const sync = (event: StorageEvent) => {
      if (event.storageArea === localStorage && (event.key === CAMERA_POPUP_PAUSE_KEY || event.key === null)) reconcile();
    };
    window.addEventListener('storage', sync);
    reconcile();
    return () => window.removeEventListener('storage', sync);
  }, []);
  useEffect(() => {
    if (until && now >= until && useStore.getState().cameraPopupsSuppressedUntil === until) resume();
  }, [until, now, resume]);

  if (until <= now) return null;
  return (
    <div className="mx-4 md:mx-8 mt-2 shrink-0 rounded-xl border border-line bg-[var(--bg2)] px-3 py-2 text-sm flex flex-wrap items-center gap-2">
      <BellOff size={16} className="shrink-0 text-muted" />
      <div className="flex-1 min-w-0" role="status">
        <strong>Kamera-Popups unterdrückt</strong>
        <span className="block text-xs text-muted">
          In diesem Browser bis {new Date(until).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} · noch {Math.ceil((until - now) / 60000)} Min.
        </span>
      </div>
      <button className="btn !py-1.5 !px-3 !text-xs" onClick={resume}>Unterdrückung beenden</button>
    </div>
  );
}

/** Props belong to this event's element, so store resets cannot change its exit. */
function MotionPopupLayer({ popup, seconds, refresh, live, position, size, dismiss, openCam, onSuppress }: {
  popup: MotionEvent;
  seconds: number;
  refresh: number;
  live: boolean;
  position: PopupPosition;
  size: PopupSize;
  dismiss: () => void;
  openCam: (id: string) => void;
  onSuppress: () => void;
}) {
  const reducedMotion = useMedia('(prefers-reduced-motion: reduce)');
  const present = useIsPresent();
  const kind = popup.kind;
  const color = KIND_STYLE[kind].color;
  const centered = position === 'center';
  const duration = reducedMotion ? 0.12 : 0.24;
  return (
    <motion.div
      className={centered
        ? 'fixed inset-0 z-40 grid place-items-center p-2 sm:p-6 bg-black/55 backdrop-blur-[2px] safe-t safe-b'
        : 'fixed inset-0 z-40 pointer-events-none'}
      inert={!present}
      style={{ pointerEvents: present ? undefined : 'none' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration }}
      onClick={centered ? dismiss : undefined}
    >
      <motion.div
        className={`glass ${KIND_STYLE[kind].tone} overflow-hidden pointer-events-auto ${centered ? '' : 'absolute right-3 left-3 sm:left-auto sm:right-6 top-3 sm:top-auto sm:bottom-6 sm:w-[var(--popup-w)] safe-t'}`}
        style={{
          background: 'color-mix(in srgb, var(--bg2) 96%, transparent)',
          borderColor: `color-mix(in srgb, ${color} 55%, transparent)`,
          boxShadow: `0 20px 60px -10px rgba(0,0,0,.7), 0 0 40px -10px ${color}`,
          width: centered ? POPUP_WIDTH.center[size] : undefined,
          ['--popup-w' as string]: POPUP_WIDTH.corner[size],
        }}
        initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.75 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: reducedMotion ? 1 : 0.75 }}
        transition={{ duration, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
        role="alert"
      >
        <div className={`flex items-center gap-2 ${centered ? 'p-4' : 'p-3'}`}>
          <div className={`icon-bubble on anim-ring ${centered ? '!w-11 !h-11' : '!w-9 !h-9'}`}><KindIcon kind={kind} size={centered ? 22 : 18} /></div>
          <div className="min-w-0 flex-1">
            <div className={`font-semibold leading-tight truncate ${centered ? 'text-lg' : ''}`}>{MOTION_LABEL[kind]}: {popup.name}</div>
            <div className="text-xs text-muted">{popup.source} · {new Date(popup.ts).toLocaleTimeString('de-DE')}</div>
          </div>
          <button className="btn btn-icon" onClick={dismiss} aria-label="Schließen"><X size={centered ? 18 : 16} /></button>
        </div>
        <button className="block w-full aspect-video" onClick={() => { openCam(popup.cameraId); dismiss(); }} aria-label="Kamera vergrößern">
          {live
            ? <LiveImage id={popup.cameraId} seconds={refresh} quality={size === 'medium' ? 'balanced' : 'high'} className="w-full h-full" />
            : <SnapshotImage id={popup.cameraId} seconds={refresh} quality={size === 'medium' ? 'balanced' : 'high'} className="w-full h-full" />}
        </button>
        <div className="px-3 py-2">
          <button className="btn !py-1.5 !text-xs w-full" onClick={onSuppress}><BellOff size={14} /> Kamera Popups unterdrücken</button>
        </div>
        <motion.div key={seconds} className="h-1 origin-left" style={{ background: color }} initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: seconds, ease: 'linear' }} />
      </motion.div>
    </motion.div>
  );
}
