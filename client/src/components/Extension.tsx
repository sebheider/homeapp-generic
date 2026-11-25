/**
 * Pages and widgets of external modules (Einstellungen → Module, see lib/extensions.ts and docs/MODULES.md).
 *
 * - `cards`: ready-made cards (value, switch, slider, button, text) rendered by the app itself.
 * - `entry`: the module's own HTML page in a sandboxed iframe without access to the app (opaque origin).
 *   It talks to the app only through postMessage (protocol `homeapp-module/1`, client side in
 *   public/module-sdk.js): it receives the values of the datapoints the admin mapped, keyed by the
 *   module's own setting keys, and may write only the slots its manifest released with `write: true`.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Puzzle, TriangleAlert } from 'lucide-react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { ICONS } from '../lib/icons';
import {
  BRIDGE_PROTOCOL, changedValues, datapointOf, extensionConfig, extensionValues, formatCardValue, initMessage, missingSettings, parseBridgeMessage, resolveWrite,
  type ExtensionCard, type ExtensionConfig, type ExtensionManifest,
} from '../lib/extensions';
import { Empty, PageHeader, Slider, Toggle } from './ui';

/** Icon of a module (names of the app's icon registry, otherwise a puzzle piece). */
export const extensionIcon = (name: string) => ICONS[name] ?? Puzzle;

/** Opens Einstellungen → Module (the settings page reads `?tab=` once when it opens). */
export function openModuleSettings() {
  history.replaceState(null, '', `${location.pathname}?tab=modules${location.hash}`);
  useStore.getState().setView('settings');
}

/** Manifest and stored state of an installed module (null if it is not installed). */
export function useExtension(id: string) {
  const manifest = useStore((s) => s.extensions.find((m) => m.id === id) ?? null);
  const all = useStore((s) => s.config?.extensions);
  const cfg = useMemo(() => (manifest ? extensionConfig(manifest, all) : null), [manifest, all]);
  return { manifest, cfg };
}

/** CSS colours of the current theme, so module pages can match the app. */
function themeColors() {
  const css = getComputedStyle(document.documentElement);
  const pick = (v: string) => css.getPropertyValue(v).trim();
  return { bg: pick('--bg'), bg2: pick('--bg2'), fg: pick('--fg'), muted: pick('--muted'), card: pick('--card'), line: pick('--line'), accent: '#7c5cff' };
}

/* ------------------------------------------------------------------ cards */

function CardMissing() {
  return <span className="text-xs text-muted">nicht zugeordnet</span>;
}

/** One ready-made card; datapoints are addressed by the module's setting key. */
function ExtensionCardView({ card, manifest, cfg }: { card: ExtensionCard; manifest: ExtensionManifest; cfg: ExtensionConfig }) {
  const id = card.type === 'text' ? '' : datapointOf(manifest, cfg, card.datapoint);
  const value = useStore((s) => (id ? s.states[id]?.val : undefined));
  const set = useStore((s) => s.set);
  if (card.type === 'text') {
    return (
      <div className="glass tile p-4">
        {card.label && <div className="text-xs text-muted mb-1">{card.label}</div>}
        <p className="text-sm whitespace-pre-line">{card.text}</p>
      </div>
    );
  }
  const setting = manifest.settings.find((s) => s.key === card.datapoint);
  const label = card.label || setting?.label || card.datapoint;
  if (card.type === 'value') {
    return (
      <div className="glass tile p-4">
        <div className="text-xs text-muted">{label}</div>
        <div className="text-2xl font-bold tabular-nums leading-tight mt-1">{id ? formatCardValue(value, card.unit, card.decimals) : <CardMissing />}</div>
      </div>
    );
  }
  if (card.type === 'switch') {
    const on = value === true || value === 1 || value === 'on' || value === 'true';
    return (
      <div className={`glass tile p-4 flex items-center justify-between gap-3 ${on ? 'active' : ''}`}>
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{label}</div>
          <div className="text-xs text-muted">{id ? (on ? 'an' : 'aus') : <CardMissing />}</div>
        </div>
        {id && <Toggle checked={on} onChange={(v) => set(id, v)} label={label} />}
      </div>
    );
  }
  if (card.type === 'slider') {
    const n = typeof value === 'number' ? value : Number(value);
    const current = Number.isFinite(n) ? n : card.min;
    return (
      <div className="glass tile p-4">
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <div className="text-sm font-semibold truncate">{label}</div>
          <div className="text-sm tabular-nums text-muted">{id ? formatCardValue(Number.isFinite(n) ? n : null, card.unit) : <CardMissing />}</div>
        </div>
        {id && <Slider value={current} min={card.min} max={card.max} step={card.step} onCommit={(v) => set(id, v)} label={label} />}
      </div>
    );
  }
  // button: the slot's name next to it, the card's label on the button
  const title = setting?.label || card.datapoint;
  const action = card.label || 'Auslösen';
  return (
    <div className="glass tile p-4 flex items-center justify-between gap-3">
      <div className="text-sm font-semibold min-w-0">{title}</div>
      {id ? (
        <button className="btn primary shrink-0" onClick={() => (!card.confirm || window.confirm(card.confirm)) && set(id, card.value)}>{action}</button>
      ) : <CardMissing />}
    </div>
  );
}

function ExtensionCards({ cards, manifest, cfg }: { cards: ExtensionCard[]; manifest: ExtensionManifest; cfg: ExtensionConfig }) {
  return (
    <div className="grid-cards">
      {cards.map((card, i) => <ExtensionCardView key={i} card={card} manifest={manifest} cfg={cfg} />)}
    </div>
  );
}

/* ------------------------------------------------------------------ sandboxed page */

/** The module's own HTML page in a sandbox, connected through the postMessage bridge. */
function ExtensionFrame({ manifest, cfg, entry, view }: { manifest: ExtensionManifest; cfg: ExtensionConfig; entry: string; view: 'page' | 'widget' }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const states = useStore((s) => s.states);
  const theme = useStore((s) => s.theme);
  const toast = useStore((s) => s.toast);
  const [height, setHeight] = useState(480);
  const values = useMemo(() => extensionValues(manifest, cfg, states), [manifest, cfg, states]);
  // latest props for the message handler, which is registered once
  const latest = useRef({ manifest, cfg, theme });
  latest.current = { manifest, cfg, theme };
  /** Values the page knows; null until it announced itself with "ready". */
  const sent = useRef<ReturnType<typeof extensionValues> | null>(null);

  const post = (msg: object) => frame.current?.contentWindow?.postMessage(msg, '*');
  const sendInit = () => {
    const { manifest: m, cfg: c, theme: t } = latest.current;
    const msg = initMessage(m, c, useStore.getState().states, view, t, themeColors());
    sent.current = msg.values;
    post(msg);
  };

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      // sandboxed pages have the origin "null": only the window of this very frame counts
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const msg = parseBridgeMessage(e.data);
      if (!msg) return;
      if (msg.type === 'ready') sendInit();
      else if (msg.type === 'resize') {
        if (view === 'page') setHeight(Math.min(10000, Math.max(120, Math.ceil(msg.height))));
      } else {
        const reply = (ok: boolean, error?: string) => post({ protocol: BRIDGE_PROTOCOL, type: 'result', requestId: msg.requestId, ok, ...(error ? { error } : {}) });
        const target = resolveWrite(latest.current.manifest, latest.current.cfg, msg.key, msg.value);
        if ('error' in target) reply(false, target.error);
        else {
          api.setState(target.id, msg.value).then(
            () => reply(true),
            (err: Error) => {
              reply(false, err.message);
              toast(`${latest.current.manifest.name}: ${err.message}`, 'error');
            },
          );
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [view]);

  // new settings or another theme: the page starts over with a fresh "init"
  useEffect(() => {
    if (sent.current) sendInit();
  }, [cfg, theme]);
  // live values: only what changed
  useEffect(() => {
    if (!sent.current) return;
    const diff = changedValues(sent.current, values);
    sent.current = values;
    if (Object.keys(diff).length) post({ protocol: BRIDGE_PROTOCOL, type: 'values', values: diff });
  }, [values]);

  return (
    <iframe
      ref={frame}
      src={`/extensions/${encodeURIComponent(manifest.id)}/${entry}?v=${encodeURIComponent(manifest.version)}`}
      title={manifest.name}
      sandbox="allow-scripts allow-forms"
      referrerPolicy="no-referrer"
      className={`w-full block border-0 bg-transparent ${view === 'widget' ? 'flex-1 min-h-0 h-full' : 'rounded-2xl'}`}
      style={view === 'page' ? { height } : undefined}
    />
  );
}

/** Content of a page or widget: cards or the own HTML page. */
function ExtensionContent({ manifest, cfg, view }: { manifest: ExtensionManifest; cfg: ExtensionConfig; view: 'page' | 'widget' }) {
  const part = view === 'page' ? manifest.page : manifest.widget;
  if (!part) return null;
  if (part.cards) return <ExtensionCards cards={part.cards} manifest={manifest} cfg={cfg} />;
  return part.entry ? <ExtensionFrame manifest={manifest} cfg={cfg} entry={part.entry} view={view} /> : null;
}

/** Hint about settings slots that are required but still empty. */
function MissingHint({ manifest, cfg, compact = false }: { manifest: ExtensionManifest; cfg: ExtensionConfig; compact?: boolean }) {
  const missing = missingSettings(manifest, cfg);
  if (!missing.length) return null;
  return (
    <div className={`flex items-start gap-2 text-xs rounded-xl px-3 py-2 bg-amber-500/10 border border-amber-400/30 ${compact ? 'mb-2' : 'mb-4'}`}>
      <TriangleAlert size={14} className="shrink-0 mt-0.5 text-amber-400" />
      <span>
        Noch nicht eingerichtet: {missing.map((s) => s.label).join(', ')}.{' '}
        <button className="underline" onClick={openModuleSettings}>Einstellungen → Module</button>
      </span>
    </div>
  );
}

/** Why a module can not be shown (not installed, switched off, no such part), or null. */
function unavailable(manifest: ExtensionManifest | null, cfg: ExtensionConfig | null, view: 'page' | 'widget') {
  if (!manifest || !cfg) return 'Dieses externe Modul ist nicht (mehr) installiert.';
  if (!cfg.enabled) return `Das externe Modul „${manifest.name}“ ist deaktiviert.`;
  if (view === 'page' && !manifest.page) return `„${manifest.name}“ hat keine eigene Seite, nur ein Widget für die Startseite.`;
  if (view === 'widget' && !manifest.widget) return `„${manifest.name}“ hat kein Widget, nur eine eigene Seite.`;
  return null;
}

/** Page of an external module (`#ext-<id>`). */
export function ExtensionPage({ id }: { id: string }) {
  const { manifest, cfg } = useExtension(id);
  const reason = unavailable(manifest, cfg, 'page');
  if (reason || !manifest || !cfg) {
    return (
      <Empty icon={<Puzzle size={28} />} title="Modul nicht verfügbar" text={`${reason} Externe Module werden unter Einstellungen → Module installiert und aktiviert.`}>
        <button className="btn primary" onClick={openModuleSettings}>Module öffnen</button>
      </Empty>
    );
  }
  return (
    <div>
      <PageHeader title={manifest.page?.title || manifest.name} subtitle={manifest.description || undefined} />
      <MissingHint manifest={manifest} cfg={cfg} />
      <ExtensionContent manifest={manifest} cfg={cfg} view="page" />
    </div>
  );
}

/** Widget body of an external module on the freely designable start page; `note` renders the hint panel. */
export function ExtensionWidgetBody({ id, note }: { id: string; note: (text: string) => ReactNode }) {
  const { manifest, cfg } = useExtension(id);
  const reason = id ? unavailable(manifest, cfg, 'widget') : 'Noch kein Modul gewählt (⚙ beim Bearbeiten).';
  if (reason || !manifest || !cfg) return <>{note(reason ?? '')}</>;
  return (
    <>
      <MissingHint manifest={manifest} cfg={cfg} compact />
      <ExtensionContent manifest={manifest} cfg={cfg} view="widget" />
    </>
  );
}
