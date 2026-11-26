import { useContext, type ReactNode } from 'react';
import { toneStyle } from './shared';
import { HudScale, ScaleUp } from './scale';

/**
 * Glass panel in HUD style: fine grid and glowing corner brackets; `edge` adds a light that runs
 * around the edge (only for the main panel of a page: every running light is a large GPU layer).
 * `color` is the accent of the panel; `alert` (state of the house) adds a pulsing wash and a glow so a
 * warning or alarm catches the eye from across the room.
 */
export function HudPanel({
  title, color, right, children, className = '', bodyClassName = '', onClick, edge = false, alert = null,
}: {
  title?: ReactNode; color: string; right?: ReactNode; children: ReactNode; className?: string;
  edge?: boolean;
  /** Extra classes of the content area (e.g. flex layouts that fill the panel). */
  bodyClassName?: string;
  onClick?: () => void;
  alert?: 'warning' | 'alarm' | null;
}) {
  const scale = useContext(HudScale);
  const body = <div className={`relative ${bodyClassName}`}>{children}</div>;
  return (
    <section className={`hud ${onClick ? 'hud-click' : ''} ${alert ? `hud-alert hud-alert-${alert}` : ''} ${className}`} style={toneStyle(color)} onClick={onClick}>
      {alert && <span className="hud-alert-wash" aria-hidden />}
      {edge && <span className="hud-edge" aria-hidden />}
      {title && (
        <header className="hud-head">
          <span className="hud-dot" aria-hidden />
          <h2 className="hud-title">{title}</h2>
          {right && <div className="ml-auto flex items-center gap-2 text-xs text-muted">{right}</div>}
        </header>
      )}
      {scale ? (
        <ScaleUp className="relative">
          <HudScale.Provider value={false}>{body}</HudScale.Provider>
        </ScaleUp>
      ) : (
        body
      )}
    </section>
  );
}
