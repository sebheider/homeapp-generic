/** Camera pop-up after a detection: live picture of the camera, placed and sized as configured. */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useIsPresent } from 'motion/react';
import { BellOff, X } from 'lucide-react';
import { useStore } from '../../lib/store';
import { useMedia } from '../../lib/hooks';
import { CAMERA_POPUP_PAUSE_MINUTES } from '../../lib/cameraPopups';
import { MOTION_LABEL, type MotionEvent, type MotionKind, type PopupPosition, type PopupSize } from '../../lib/types';
import { Modal } from '../ui';
import { SnapshotImage, LiveImage } from './images';
import { KIND_STYLE, motionKey, KindIcon } from './motion';

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
