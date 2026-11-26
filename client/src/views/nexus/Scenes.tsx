import { useState } from 'react';
import { useStore } from '../../lib/store';
import { Icon } from '../../lib/icons';
import { NX } from '../../components/HomeTwin';
import { tc, Panel } from './Panel';

const SCENE_COLORS = [NX.violet, '#3b82f6', NX.magenta, NX.amber, NX.green, NX.cyan];

/** Scene buttons in neon colours; the pressed one shows "AKTIV" for a moment. */
export function Scenes() {
  const scenes = useStore((s) => s.config?.scenes ?? []);
  const run = useStore((s) => s.runScene);
  const [active, setActive] = useState<string | null>(null);
  if (!scenes.length) return null;
  const start = (id: string, name: string) => {
    void run(id, name);
    setActive(id);
    setTimeout(() => setActive((a) => (a === id ? null : a)), 2500);
  };
  return (
    <Panel title="Szenen" right={`${scenes.length}`} color={NX.violet}>
      <div className="nx-scenes">
        {scenes.map((s, i) => (
          <button key={s.id} className={`nx-scene ${active === s.id ? 'on' : ''}`} style={tc(SCENE_COLORS[i % SCENE_COLORS.length])} onClick={() => start(s.id, s.name)}>
            <Icon name={s.icon} size={18} />
            <span>{s.name}</span>
            {active === s.id && <em>AKTIV</em>}
          </button>
        ))}
      </div>
    </Panel>
  );
}
