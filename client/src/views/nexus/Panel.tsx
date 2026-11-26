/** Building blocks of the "Nexus" design: the glass panel with cut corners and the `--tc` colour helper. */
import type { CSSProperties, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { useStore, type View } from '../../lib/store';
import { NX } from '../../components/HomeTwin';
import { toneStyle } from '../../components/Hud';

export const tc = (c: string) => ({ '--tc': c }) as CSSProperties;

/** Glass panel with cut corners; `to` makes the header a link to that page. */
export function Panel({ title, right, to, color = NX.cyan, className = '', children }: { title: ReactNode; right?: ReactNode; to?: View; color?: string; className?: string; children: ReactNode }) {
  const setView = useStore((s) => s.setView);
  const head = (
    <>
      {title}
      <span className="nx-bars"><i /><i /><i /></span>
      {right != null && <span className="nx-r">{right}</span>}
      {to && <ChevronRight size={13} className="nx-go" />}
    </>
  );
  return (
    <section className={`nx-panel ${className}`} style={toneStyle(color)}>
      <div className="nx-in">
        {to ? <button className="nx-pt" onClick={() => setView(to)}>{head}</button> : <div className="nx-pt">{head}</div>}
        <div className="nx-body">{children}</div>
      </div>
    </section>
  );
}
