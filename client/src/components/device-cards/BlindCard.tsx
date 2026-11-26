import { motion } from 'motion/react';
import { Square, ChevronUp, ChevronDown } from 'lucide-react';
import type { Device } from '../../lib/types';
import { clamp, toNum } from '../../lib/format';
import { Slider, useStaticVisuals } from '../ui';
import { useVals, useSet, Head } from './shared';

/** Blind card. Convention: 100 % = open, 0 % = closed (option `invert` flips this for other hardware). */
export function BlindCard({ d }: { d: Device }) {
  const still = useStaticVisuals();
  const v = useVals(d);
  const set = useSet();
  const invert = Boolean(d.options.invert);
  const raw = clamp(toNum(v.position), 0, 100);
  const open = invert ? 100 - raw : raw;
  const write = (openPct: number) => set(d.states.position, invert ? 100 - openPct : openPct);
  const closedH = 100 - open;
  return (
    <div className="glass tile tone-cool p-4 flex flex-col gap-3">
      <Head d={d} icon="blinds" on={open < 100} sub={open === 100 ? 'Offen' : open === 0 ? 'Geschlossen' : `${Math.round(open)} % offen`} />
      <div className="flex gap-4 items-center">
        {/* small window with an animated slat curtain */}
        <div className="relative w-16 h-20 rounded-lg overflow-hidden border border-line flex-none" style={{ background: 'linear-gradient(180deg,#7dd3fc55,#38bdf822)' }}>
          <motion.div
            className="absolute inset-x-0 top-0"
            animate={{ height: `${closedH}%` }}
            initial={false}
            transition={still ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 20 }}
            style={{ background: 'repeating-linear-gradient(180deg,#8b97b8 0 5px,#6b7798 5px 7px)' }}
          />
        </div>
        <div className="flex-1 flex flex-col gap-2">
          <Slider value={Math.round(open)} label="Öffnung" onCommit={write} throttleMs={400} />
          <div className="flex gap-2">
            <button className="btn flex-1 !p-2" onClick={() => write(100)} aria-label="Öffnen"><ChevronUp size={18} /></button>
            {/* "stop" re-sends the current position, which halts most actuators */}
            <button className="btn flex-1 !p-2" onClick={() => write(Math.round(open))} aria-label="Stopp"><Square size={14} /></button>
            <button className="btn flex-1 !p-2" onClick={() => write(0)} aria-label="Schließen"><ChevronDown size={18} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
