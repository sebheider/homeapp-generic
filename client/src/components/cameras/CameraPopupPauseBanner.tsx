import { useEffect } from 'react';
import { BellOff } from 'lucide-react';
import { useStore } from '../../lib/store';
import { useNow } from '../../lib/hooks';
import { CAMERA_POPUP_PAUSE_KEY, loadCameraPopupPause } from '../../lib/cameraPopups';

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
