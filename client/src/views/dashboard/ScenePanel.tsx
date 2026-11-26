import { useState } from 'react';
import { motion } from 'motion/react';
import { useStore } from '../../lib/store';
import { Icon } from '../../lib/icons';
import { HudPanel, toneStyle } from '../../components/Hud';
import { C } from './colors';

/**
 * Scene buttons in neon style (the pressed one lights up briefly); compact: two columns that fill the
 * panel (kiosk); `row`: up to four columns across the full width (kiosk in portrait format).
 */
export function ScenePanel({ compact = false, row = false }: { compact?: boolean; row?: boolean }) {
  const scenes = useStore((s) => s.config!.scenes);
  const runScene = useStore((s) => s.runScene);
  const ripples = useStore((s) => s.display.effects !== 'low');
  const [fired, setFired] = useState<string | null>(null);
  // touch point of the last tap (button-relative), the ripple spreads from there
  const [ripple, setRipple] = useState<{ id: string; x: number; y: number; n: number } | null>(null);
  const start = (id: string, name: string, e: { clientX: number; clientY: number; currentTarget: HTMLElement }) => {
    void runScene(id, name);
    setFired(id);
    const r = e.currentTarget.getBoundingClientRect();
    // the kiosk zoom scales the box but not the offset inside it
    const zoom = r.width / (e.currentTarget.offsetWidth || r.width);
    if (ripples) setRipple((p) => ({ id, x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom, n: (p?.n ?? 0) + 1 }));
    setTimeout(() => setFired((f) => (f === id ? null : f)), 700);
    setTimeout(() => setRipple((p) => (p?.id === id ? null : p)), 750);
  };
  return (
    <HudPanel title="Szenen" color={C.violet} className={compact ? 'h-full min-h-0 flex flex-col' : ''} bodyClassName={compact ? 'flex-1 min-h-0 overflow-y-auto no-scrollbar' : ''}>
      <div className={row ? 'grid gap-2' : compact ? 'grid grid-cols-2 gap-2' : 'flex flex-wrap gap-2'} style={row ? { gridTemplateColumns: `repeat(${Math.min(4, Math.max(2, scenes.length))}, minmax(0, 1fr))` } : undefined}>
        {scenes.map((s) => (
          <motion.button
            key={s.id}
            whileTap={{ scale: 0.94 }}
            whileHover={{ y: -2 }}
            className={`hud-chip ripple-host !py-2 !px-3.5 !text-sm !rounded-xl ${compact || row ? 'justify-start min-w-0' : ''} ${fired === s.id ? 'scene-fired' : ''}`}
            style={toneStyle(C.violet)}
            onClick={(e) => start(s.id, s.name, e)}
          >
            {ripple?.id === s.id && <span key={ripple.n} className="ripple" style={{ left: ripple.x, top: ripple.y }} />}
            <Icon name={s.icon} size={16} /> <span className="truncate">{s.name}</span>
          </motion.button>
        ))}
      </div>
    </HudPanel>
  );
}
