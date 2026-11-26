import { useEffect } from 'react';
import { Radio, X } from 'lucide-react';
import { useStore } from '../../lib/store';
import { Modal } from '../ui';
import { LiveImage } from './images';

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
