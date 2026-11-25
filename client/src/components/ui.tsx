/**
 * Reusable UI building blocks: toggle switch, throttled slider, modal dialog, page header, empty state,
 * loading placeholder, content panel, key-figure tile, animated value, level bar, staggered entrance
 * animation and the round setpoint dial.
 */
import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, motion, useIsPresent } from 'motion/react';
import { LoaderCircle, Settings, X } from 'lucide-react';
import { clamp } from '../lib/format';
import { useStore } from '../lib/store';
import { useMedia } from '../lib/display';

export const StaticVisualsContext = createContext(false);
export const useStaticVisuals = () => useContext(StaticVisualsContext);

/** On/off switch. Clicks do not bubble, so it can sit inside clickable tiles. */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="switch"
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
    />
  );
}

interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onCommit: (v: number) => void;
  label?: string;
  throttleMs?: number;
}

/** Slider that stays smooth while dragging (local value) and sends throttled updates. */
export function Slider({ value, min = 0, max = 100, step = 1, onCommit, label, throttleMs = 180 }: SliderProps) {
  // value shown while the user drags; null = follow the datapoint value
  const [local, setLocal] = useState<number | null>(null);
  const last = useRef(0);
  const shown = local ?? value;
  const pct = ((clamp(shown, min, max) - min) / (max - min || 1)) * 100;

  // hand control back to the datapoint as soon as it has caught up with the dragged value
  useEffect(() => {
    if (local !== null && Math.abs(local - value) < step / 2) setLocal(null);
  }, [value]);

  const send = (v: number, force = false) => {
    const now = Date.now();
    if (force || now - last.current > throttleMs) {
      last.current = now;
      onCommit(v);
    }
  };

  return (
    <input
      type="range"
      className="slider"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={shown}
      style={{ '--p': `${pct}%` } as CSSProperties}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const v = Number(e.target.value);
        setLocal(v);
        send(v);
      }}
      onPointerUp={() => {
        if (local !== null) send(local, true);
        setTimeout(() => setLocal(null), 1200);
      }}
      onKeyUp={() => local !== null && send(local, true)}
    />
  );
}

/** Animated dialog; closes on Escape and on a click on the backdrop. */
export function Modal({ open, onClose, title, children, wide, zoom = false }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; wide?: boolean; zoom?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <ModalLayer onClose={onClose} title={title} wide={wide} zoom={zoom}>
          {children}
        </ModalLayer>
      )}
    </AnimatePresence>
  );
}

/** Presence retains this element's last visible children until its exit finishes. */
function ModalLayer({ onClose, title, children, wide, zoom }: { onClose: () => void; title?: string; children: ReactNode; wide?: boolean; zoom: boolean }) {
  const reducedMotion = useMedia('(prefers-reduced-motion: reduce)');
  const present = useIsPresent();
  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm"
      inert={!present}
      style={{ pointerEvents: present ? undefined : 'none' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={zoom ? { duration: reducedMotion ? 0.12 : 0.24 } : undefined}
      onClick={onClose}
    >
      <motion.div
        className={`glass w-full ${wide ? 'max-w-5xl' : 'max-w-xl'} max-h-[92dvh] overflow-auto p-5 sm:p-6 bg-[var(--bg2)]`}
        style={{ background: 'color-mix(in srgb, var(--bg2) 92%, transparent)' }}
        initial={{ opacity: 0, scale: reducedMotion ? 1 : zoom ? 0.75 : 0.94, y: reducedMotion || zoom ? 0 : 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: reducedMotion ? 1 : zoom ? 0.75 : 0.96, y: reducedMotion || zoom ? 0 : 12 }}
        transition={zoom || reducedMotion ? { duration: reducedMotion ? 0.12 : 0.24, ease: 'easeOut' } : { type: 'spring', stiffness: 380, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button className="btn btn-icon" onClick={onClose} aria-label="Schließen">
              <X size={18} />
            </button>
          </div>
        )}
        {children}
      </motion.div>
    </motion.div>
  );
}

/** Page title with optional subtitle and action buttons on the right. */
export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-header flex flex-wrap items-end justify-between gap-3 mb-5">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-muted text-sm mt-1">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2 flex-wrap">{children}</div>
    </div>
  );
}

/** Placeholder card for pages without content (e.g. nothing configured yet). */
export function Empty({ icon, title, text, children }: { icon: ReactNode; title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="glass p-8 sm:p-12 text-center flex flex-col items-center gap-3">
      <div className="icon-bubble anim-float !w-16 !h-16 !rounded-2xl">{icon}</div>
      <h3 className="text-lg font-semibold">{title}</h3>
      {text && <p className="text-muted max-w-md text-sm">{text}</p>}
      {children}
    </div>
  );
}

/** Primary button that opens the settings page (used by the empty states of the pages). */
export function OpenSettingsButton() {
  const setView = useStore((s) => s.setView);
  return <button className="btn primary" onClick={() => setView('settings')}><Settings size={15} /> Einstellungen öffnen</button>;
}

/** Placeholder while a page or a part of it is loading. */
export function Loading({ className = 'h-40' }: { className?: string }) {
  return (
    <div className={`${className} grid place-items-center text-muted`} role="status">
      <span className="inline-flex items-center gap-2 text-sm"><LoaderCircle size={18} className="anim-spin-fast anim-loader" aria-hidden /> Lädt …</span>
    </div>
  );
}

/** Content card with the standard padding, a small heading and optional content on the right (legend, actions). */
export function Panel({ title, right, className = '', children }: { title?: ReactNode; right?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`glass p-4 sm:p-5 ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          {title && <h2 className="section-title">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

/** Key-figure tile: coloured icon, label, big value with unit and an optional sub line. */
export function StatTile({
  icon, label, value, unit, sub, tone, valueClassName = 'text-xl sm:text-2xl',
}: {
  icon: ReactNode; label: string; value: ReactNode; unit?: string; sub?: ReactNode; tone: string;
  /** Font size classes of the value. */
  valueClassName?: string;
}) {
  return (
    <div className={`glass tile tone-${tone} p-4 flex items-center gap-3`}>
      <div className="icon-bubble on">{icon}</div>
      <div className="min-w-0">
        <div className="text-xs text-muted">{label}</div>
        <div className={`${valueClassName} font-bold leading-tight tabular-nums`}>
          <Ticker value={value} />
          {unit && <span className="text-sm font-medium text-muted ml-1">{unit}</span>}
        </div>
        {sub && <div className="text-xs text-muted truncate">{sub}</div>}
      </div>
    </div>
  );
}

/**
 * Shows a value that briefly slides in whenever it changes (texts and numbers only; other content is
 * rendered as is). Static when visuals are reduced.
 */
export function Ticker({ value }: { value: ReactNode }) {
  const still = useStaticVisuals();
  if (still || (typeof value !== 'string' && typeof value !== 'number')) return <>{value}</>;
  return <span key={value} className="tick">{value}</span>;
}

/** Thin bar that visualises a level from 0 to 100 % in the tone colour of the surrounding card. */
export function LevelBar({ value, label }: { value: number; label?: string }) {
  const pct = clamp(value, 0, 100);
  return (
    <div className="level-bar" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Container whose `Rise` children animate in one after another. */
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  const still = useStaticVisuals();
  if (still) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.035 } } }}>
      {children}
    </motion.div>
  );
}

/** Entrance animation variants (fade + slide up) used by `Rise`. */
export const rise = {
  hidden: { opacity: 0, y: 14, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 320, damping: 26 } },
};

/** Animates in when its `Stagger` parent appears. */
export function Rise({ children, className }: { children: ReactNode; className?: string }) {
  const still = useStaticVisuals();
  if (still) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} variants={rise}>
      {children}
    </motion.div>
  );
}

/** Circular setpoint dial with +/- buttons. The arc spans 270° starting at the lower left. */
export function Dial({
  value, min, max, step, onChange, unit = '°', tone, sub, size = 150,
}: {
  value: number; min: number; max: number; step: number; onChange: (v: number) => void; unit?: string; tone?: string; sub?: ReactNode; size?: number;
}) {
  const r = 52;
  const start = 135;
  const sweep = 270;
  const frac = clamp((value - min) / (max - min || 1), 0, 1);
  // point on the circle (centre 60/60 of the 120×112 view box) at an angle in degrees
  const pt = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return [60 + r * Math.cos(a), 60 + r * Math.sin(a)];
  };
  // SVG arc path between two angles; the large-arc flag is needed beyond 180°
  const arc = (from: number, to: number) => {
    const [x1, y1] = pt(from);
    const [x2, y2] = pt(to);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  const [kx, ky] = pt(start + sweep * frac);
  const dec = step < 1 ? 1 : 0;
  // one step up / down, snapped to the step grid and kept within the range
  const bump = (d: number) => onChange(clamp(Math.round((value + d * step) / step) * step, min, max));
  return (
    <div className="flex flex-col items-center" style={{ ['--tone' as string]: tone }}>
      <div className="relative" style={{ width: `${size / 16}rem`, height: `${(size * 0.92) / 16}rem` }}>
        <svg viewBox="0 0 120 112" className="w-full h-full overflow-visible">
          <path d={arc(start, start + sweep)} fill="none" stroke="var(--track)" strokeWidth="9" strokeLinecap="round" />
          <path
            d={arc(start, start + Math.max(0.01, sweep * frac))}
            fill="none"
            stroke="var(--tone)"
            strokeWidth="9"
            strokeLinecap="round"
            style={{ filter: 'drop-shadow(0 0 6px color-mix(in srgb, var(--tone) 70%, transparent))', transition: 'd .35s ease' }}
          />
          <circle cx={kx} cy={ky} r="6.5" fill="#fff" style={{ transition: 'cx .35s ease, cy .35s ease' }} />
        </svg>
        <div className="absolute inset-0 grid place-items-center pointer-events-none pb-3">
          <div className="text-center leading-none">
            <div className="text-3xl font-bold tabular-nums">
              {value.toFixed(dec).replace('.', ',')}
              <span className="text-lg text-muted font-semibold">{unit}</span>
            </div>
            {sub && <div className="text-xs text-muted mt-1.5">{sub}</div>}
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 flex justify-between px-2">
          <button className="btn btn-icon !rounded-full text-xl" onClick={(e) => { e.stopPropagation(); bump(-1); }} aria-label="Weniger">−</button>
          <button className="btn btn-icon !rounded-full text-xl" onClick={(e) => { e.stopPropagation(); bump(1); }} aria-label="Mehr">+</button>
        </div>
      </div>
    </div>
  );
}
