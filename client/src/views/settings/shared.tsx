/**
 * Building blocks shared by the settings tabs: form layout components, small buttons,
 * webhook URL helpers and pure helpers for editing the configuration draft.
 */
import { useState, type ReactNode } from 'react';
import { Copy, Trash2 } from 'lucide-react';
import type { EnvDefault } from '../../lib/api';
import type { AppConfig } from '../../lib/types';
import { Toggle } from '../../components/ui';

/** Props every settings tab receives. */
export interface TabProps {
  draft: AppConfig;
  setDraft: (c: AppConfig) => void;
  webhookToken: string;
  /** Secret of the kiosk agents' report address (POST /api/kiosk/report). */
  kioskToken?: string;
  /** Defaults provided by environment variables (the app settings take precedence once set by hand). */
  envDefaults: EnvDefault[];
  /** Fields that are handed back to the environment default on the next save. */
  resetEnv: string[];
  toggleReset: (field: string) => void;
}

/* ------------------------------------------------------------ draft helpers */

/** Config sections that are plain objects (as opposed to lists). */
type ObjectSection = 'app' | 'iobroker' | 'homeassistant' | 'surveillance' | 'energy' | 'weather' | 'octoprint' | 'bambu' | 'spotify';

/** Returns a setter that merges a partial update into one section of the draft. */
export const sectionSetter =
  <K extends ObjectSection>(draft: AppConfig, setDraft: (c: AppConfig) => void, key: K) =>
  (p: Partial<AppConfig[K]>) =>
    setDraft({ ...draft, [key]: { ...draft[key], ...p } });

/** Merges `p` into the list entry with the given id. */
export const patchById = <T extends { id: string }>(list: T[], id: string, p: Partial<T>) => list.map((x) => (x.id === id ? { ...x, ...p } : x));

/** Adds `v` to the list or removes it if it is already contained. */
export const toggleItem = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/** Creates a readable id from a name ("Küche" -> "kueche") that is not in `taken` yet (adds _2, _3, ...). */
export const uid = (base: string, taken: string[]) => {
  const slug = base.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'neu';
  let id = slug;
  for (let i = 2; taken.includes(id); i++) id = `${slug}_${i}`;
  return id;
};

/** Class names that grey out and lock a block whose feature is switched off. */
export const dimUnless = (enabled: boolean) => (enabled ? '' : 'opacity-50 pointer-events-none');

/* ------------------------------------------------------------ form layout */

/** Labelled form field with optional hint and an extra note below. */
export function Field({ label, hint, note, children, className = '' }: { label: string; hint?: string; note?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="lbl">{label}</label>
      {children}
      {hint && <p className="text-[0.7rem] text-muted mt-1">{hint}</p>}
      {note}
    </div>
  );
}

/** Settings section with a title and an optional control on the right. */
export function Card({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="glass p-4 sm:p-5 mb-4">
      <div className="flex items-center justify-between mb-4 gap-3">
        <h2 className="font-semibold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

/** Text label with a toggle switch on the right. */
export const Switch = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <div className="flex items-center justify-between gap-3 py-1.5">
    <span className="text-sm">{label}</span>
    <Toggle checked={checked} onChange={onChange} label={label} />
  </div>
);

/** Number input that maps an empty field to undefined. */
export function NumInput({ value, onChange, placeholder }: { value: number | undefined; onChange: (v: number | undefined) => void; placeholder?: string }) {
  return <input className="field" type="number" step="any" value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />;
}

/** Hint shown instead of an empty list. */
export function EmptyHint({ children }: { children: ReactNode }) {
  return <div className="glass p-8 text-center text-sm text-muted">{children}</div>;
}

/** Small red trash-can button. */
export function DeleteButton({ onClick, label = 'Löschen' }: { onClick: () => void; label?: string }) {
  return <button className="btn btn-icon danger" onClick={onClick} aria-label={label}><Trash2 size={15} /></button>;
}

/* ------------------------------------------------------------ copy helpers */

/** A URL with a copy button. */
export function CopyUrl({ label, url }: { label: string; url: string }) {
  return (
    <div className="mt-2">
      <div className="mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <code className="flex-1 break-all font-mono text-[0.7rem] bg-black/20 rounded-lg px-2 py-1.5 select-all">{url}</code>
        <button className="btn btn-icon" onClick={() => navigator.clipboard?.writeText(url)} aria-label="Kopieren"><Copy size={14} /></button>
      </div>
    </div>
  );
}

/** Webhook URL the Surveillance Station calls on a detection (`camera` = id or name). */
const webhookUrl = (kind: 'motion' | 'people', camera: string, token: string) => {
  const origin = typeof location !== 'undefined' ? location.origin : '';
  return `${origin}/api/webhook/${kind}/${camera}?token=${token}`;
};

/** Copyable webhook URLs for normal motion and advanced detection of one camera. */
export function WebhookUrls({ camera, token }: { camera: string; token: string }) {
  return (
    <>
      <CopyUrl label="Normale Bewegung" url={webhookUrl('motion', camera, token)} />
      <CopyUrl label="Erweiterte Erkennung (Person)" url={webhookUrl('people', camera, token)} />
    </>
  );
}

/** A script with a copy button (read-only text area). */
export function CodeBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <textarea readOnly className="field font-mono !text-[0.7rem] h-56 resize-y" value={text} onFocus={(e) => e.currentTarget.select()} />
      <button
        className="btn !py-1 !text-xs absolute top-2 right-5"
        onClick={() => {
          navigator.clipboard?.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        <Copy size={13} /> {copied ? 'Kopiert' : 'Kopieren'}
      </button>
    </div>
  );
}
