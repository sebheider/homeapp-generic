/**
 * Einstellungen → Module.
 * - Integrated modules are part of the app: they can only be switched off (their settings are kept).
 * - External modules are installed from a package (ZIP or module.json, schema docs/module.schema.json).
 *   Installing and removing take effect at once; switching on and the settings are part of the draft
 *   and apply after saving, like every other setting.
 */
import { useEffect, useRef, useState } from 'react';
import { ExternalLink, FileUp, LayoutDashboard, PanelTop, RotateCw, ShieldCheck, TriangleAlert } from 'lucide-react';
import { api } from '../../lib/api';
import { useStore } from '../../lib/store';
import { extensionConfig, missingSettings, type ExtensionConfig, type ExtensionSetting, type ExtensionValue, type InstalledExtension } from '../../lib/extensions';
import { StatePicker } from '../../components/Pickers';
import { extensionIcon } from '../../components/Extension';
import { Toggle } from '../../components/ui';
import { Card, CodeBlock, DeleteButton, Field, NumInput, Switch, type TabProps } from './shared';

const MAX_PACKAGE_MB = 5;
const DOCS_URL = 'https://github.com/sebheider/homeapp-generic/blob/main/docs/MODULES.md';

const BUILT_IN = [
  ['weather', 'Wetter', 'Vorhersage, Regenradar, Mond und lokale Wetterstation.'],
  ['printer', '3D-Drucker', 'OctoPrint oder Bambu Lab mit Webcam und Druck-Pop-ups.'],
  ['spotify', 'Spotify', 'Wiedergabe und Mini-Player über Spotify Connect.'],
  ['mower', 'Mähroboter', 'Seite, Karte und Steuerung des Mähroboters.'],
] as const;

/** Integrated modules: fixed part of the app, only switchable. */
function BuiltInModules({ draft, setDraft }: Pick<TabProps, 'draft' | 'setDraft'>) {
  return (
    <Card title="Integrierte Module">
      <p className="text-sm text-muted mb-3">
        Fester Bestandteil der App. Sie lassen sich nicht entfernen, aber deaktivieren – ihre Einstellungen bleiben erhalten und gelten wieder, sobald das Modul aktiviert wird. Änderungen gelten nach dem Speichern.
      </p>
      <div className="divide-y divide-[var(--line)]">
        {BUILT_IN.map(([id, label, text]) => (
          <div key={id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <div className="text-sm font-medium">{label}</div>
              <div className="text-xs text-muted">{text}</div>
            </div>
            <Toggle checked={draft.modules[id]} onChange={(enabled) => setDraft({ ...draft, modules: { ...draft.modules, [id]: enabled } })} label={label} />
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Input for one settings slot declared by the module. */
function SettingField({ setting, value, onChange }: { setting: ExtensionSetting; value: ExtensionValue; onChange: (v: ExtensionValue) => void }) {
  const label = `${setting.label}${setting.required ? ' *' : ''}`;
  const hint = [setting.description, setting.type === 'datapoint' ? (setting.write ? 'Das Modul darf diesen Datenpunkt lesen und schalten.' : 'Das Modul darf diesen Datenpunkt nur lesen.') : '']
    .filter(Boolean).join(' ');
  switch (setting.type) {
    case 'datapoint':
      return <Field label={label} hint={hint}><StatePicker value={typeof value === 'string' ? value : ''} onChange={onChange} /></Field>;
    case 'number':
      return (
        <Field label={`${label}${setting.unit ? ` (${setting.unit})` : ''}`} hint={hint || undefined}>
          <NumInput value={typeof value === 'number' ? value : undefined} onChange={(v) => onChange(v ?? null)} />
        </Field>
      );
    case 'boolean':
      return <div><Switch label={label} checked={value === true} onChange={onChange} />{hint && <p className="text-[0.7rem] text-muted">{hint}</p>}</div>;
    case 'select':
      return (
        <Field label={label} hint={hint || undefined}>
          <select className="field" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)}>
            {(setting.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
      );
    default:
      return <Field label={label} hint={hint || undefined}><input className="field" value={typeof value === 'string' ? value : ''} maxLength={200} onChange={(e) => onChange(e.target.value)} /></Field>;
  }
}

/** One installed external module: details, switch, settings and removal. */
function ExtensionItem({ item, draft, setDraft, onRemove }: { item: InstalledExtension; draft: TabProps['draft']; setDraft: TabProps['setDraft']; onRemove: () => void }) {
  const m = item.manifest;
  if (!m) {
    return (
      <div className="rounded-2xl border border-rose-400/40 bg-rose-500/5 p-4 flex items-start gap-3">
        <TriangleAlert size={18} className="text-rose-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm">{item.id}</div>
          <p className="text-xs text-rose-300 mt-0.5 break-words">Fehlerhaftes Paket: {item.error}</p>
          <p className="text-xs text-muted mt-1">Das Modul ist nicht nutzbar. Eine korrigierte Version installieren oder das Modul entfernen.</p>
        </div>
        <DeleteButton onClick={onRemove} label={`${item.id} entfernen`} />
      </div>
    );
  }
  const cfg = extensionConfig(m, draft.extensions);
  const update = (next: ExtensionConfig) => setDraft({ ...draft, extensions: { ...draft.extensions, [m.id]: next } });
  const Icon = extensionIcon(m.icon);
  const missing = missingSettings(m, cfg);
  return (
    <div className="rounded-2xl border border-line p-4">
      <div className="flex items-start gap-3">
        <div className={`icon-bubble tone-violet ${cfg.enabled ? 'on' : ''} !w-10 !h-10 shrink-0`}><Icon size={18} /></div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-semibold">{m.name}</span>
            <span className="text-xs text-muted">Version {m.version}{m.author ? ` · ${m.author}` : ''}</span>
          </div>
          {m.description && <p className="text-xs text-muted mt-0.5">{m.description}</p>}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {m.page && <span className="chip !text-[0.68rem]"><PanelTop size={11} /> Eigene Seite{m.page.entry ? ' (HTML)' : ''}</span>}
            {m.widget && <span className="chip !text-[0.68rem]"><LayoutDashboard size={11} /> Startseiten-Widget{m.widget.entry ? ' (HTML)' : ''}</span>}
            {m.homepage && (
              <a className="chip !text-[0.68rem]" href={m.homepage} target="_blank" rel="noreferrer noopener"><ExternalLink size={11} /> Projektseite</a>
            )}
          </div>
        </div>
        <Toggle checked={cfg.enabled} onChange={(enabled) => update({ ...cfg, enabled })} label={`${m.name} aktivieren`} />
      </div>
      {m.settings.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-3 mt-4">
          {m.settings.map((s) => (
            <SettingField key={s.key} setting={s} value={cfg.settings[s.key] ?? null} onChange={(v) => update({ ...cfg, settings: { ...cfg.settings, [s.key]: v } })} />
          ))}
        </div>
      )}
      {cfg.enabled && missing.length > 0 && (
        <p className="text-xs text-amber-400 mt-3">Pflichtfelder fehlen noch: {missing.map((s) => s.label).join(', ')}.</p>
      )}
      <div className="flex justify-end mt-3">
        <button className="btn !py-1.5 !text-xs danger" onClick={onRemove}>Entfernen</button>
      </div>
    </div>
  );
}

/** External modules: install from a package, list, switch on, configure and remove. */
function ExternalModules({ draft, setDraft }: Pick<TabProps, 'draft' | 'setDraft'>) {
  const toast = useStore((s) => s.toast);
  const [list, setList] = useState<InstalledExtension[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = () =>
    api.extensions()
      .then((r) => {
        setList(r.extensions);
        setError('');
      })
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const install = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_PACKAGE_MB * 1024 * 1024) return toast(`Das Paket ist größer als ${MAX_PACKAGE_MB} MB`, 'error');
    setBusy(true);
    try {
      const r = await api.installExtension(file);
      const what = r.previousVersion ? `aktualisiert (${r.previousVersion} → ${r.manifest.version})` : `${r.manifest.version} installiert`;
      toast(`${r.manifest.name} ${what}${extensionConfig(r.manifest, draft.extensions).enabled ? '' : ' – jetzt aktivieren und speichern'}`, 'success');
      await load();
    } catch (e) {
      toast(`Installation fehlgeschlagen: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const remove = async (item: InstalledExtension) => {
    const name = item.manifest?.name ?? item.id;
    if (!window.confirm(`Externes Modul „${name}“ mit allen Dateien und Einstellungen entfernen?`)) return;
    try {
      // the server drops the module's stored settings itself; the draft keeps no unsaved change for it
      await api.removeExtension(item.id);
      toast(`${name} entfernt`, 'success');
      await load();
    } catch (e) {
      toast(`Entfernen fehlgeschlagen: ${(e as Error).message}`, 'error');
    }
  };

  return (
    <Card
      title="Externe Module"
      right={
        <div className="flex gap-2">
          <button className="btn btn-icon" onClick={() => load()} aria-label="Liste neu laden" title="Liste neu laden"><RotateCw size={15} /></button>
          <button className="btn primary" disabled={busy} onClick={() => input.current?.click()}><FileUp size={15} /> {busy ? 'Installiert …' : 'Modul installieren'}</button>
        </div>
      }
    >
      <input ref={input} type="file" accept=".zip,.json,application/zip,application/json" className="hidden" onChange={(e) => install(e.target.files?.[0])} />
      <p className="text-sm text-muted mb-3">
        Erweiterungen von Dritten oder eigene Module – z. B. Pool, Wallbox, Bewässerung. Ein Modul ist ein ZIP-Paket (oder eine einzelne <code>module.json</code>) nach dem
        Modul-Schema Version 1 und bringt eine eigene Seite und/oder ein Startseiten-Widget mit. Installieren und Entfernen wirken sofort; Aktivieren und die Einstellungen gelten nach dem Speichern.{' '}
        <a className="underline" href={DOCS_URL} target="_blank" rel="noreferrer noopener">Anleitung &amp; Schema</a>
      </p>
      <div className="flex items-start gap-2 text-xs rounded-xl px-3 py-2 mb-4 bg-sky-500/10 border border-sky-400/30">
        <ShieldCheck size={14} className="shrink-0 mt-0.5 text-sky-400" />
        <span>
          Module laufen abgeschottet: Sie sehen nur die Datenpunkte, die du ihnen hier zuordnest, und schalten nur die, die das Modul ausdrücklich als „schreibend“ anmeldet.
          Auf den Server, deine Zugangsdaten und die übrigen Einstellungen haben sie keinen Zugriff. Installiere trotzdem nur Module aus vertrauenswürdigen Quellen.
        </span>
      </div>
      {error && <p className="text-sm text-rose-400 mb-3">{error}</p>}
      {list === null && !error && <p className="text-sm text-muted">Lädt …</p>}
      {list?.length === 0 && (
        <div className="text-sm text-muted">
          <p className="mb-2">Noch keine externen Module installiert. Minimales Beispiel einer <code>module.json</code>:</p>
          <CodeBlock text={EXAMPLE} />
        </div>
      )}
      <div className="flex flex-col gap-3">
        {list?.map((item) => <ExtensionItem key={item.id} item={item} draft={draft} setDraft={setDraft} onRemove={() => remove(item)} />)}
      </div>
    </Card>
  );
}

const EXAMPLE = JSON.stringify({
  manifestVersion: 1,
  id: 'pool',
  name: 'Pool',
  version: '1.0.0',
  icon: 'waves',
  settings: [
    { key: 'water', type: 'datapoint', label: 'Wassertemperatur', required: true },
    { key: 'pump', type: 'datapoint', label: 'Pumpe', write: true },
  ],
  page: { cards: [{ type: 'value', datapoint: 'water', unit: '°C', decimals: 1 }, { type: 'switch', datapoint: 'pump' }] },
}, null, 2);

export function ModulesTab({ draft, setDraft }: TabProps) {
  return (
    <>
      <BuiltInModules draft={draft} setDraft={setDraft} />
      <ExternalModules draft={draft} setDraft={setDraft} />
    </>
  );
}
