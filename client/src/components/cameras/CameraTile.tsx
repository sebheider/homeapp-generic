import { motion } from 'motion/react';
import { Expand } from 'lucide-react';
import { useStore } from '../../lib/store';
import { timeAgo } from '../../lib/format';
import { MOTION_LABEL, type CameraInfo } from '../../lib/types';
import { useStaticVisuals } from '../ui';
import { SnapshotImage } from './images';
import { useRecentMotion, KIND_STYLE, KindIcon } from './motion';

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
