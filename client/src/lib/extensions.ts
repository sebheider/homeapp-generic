/**
 * External modules (installed through Einstellungen → Module, see server/src/extensions.js and docs/MODULES.md).
 * Pure helpers shared by the navigation, the module pages / widgets and the bridge to sandboxed module pages.
 */
import type { StateEntry } from './types';

export type ExtensionSettingType = 'datapoint' | 'text' | 'number' | 'boolean' | 'select';
export type ExtensionValue = string | number | boolean | null;

export interface ExtensionSetting {
  key: string;
  type: ExtensionSettingType;
  label: string;
  description: string;
  required: boolean;
  /** datapoint: the module may change the value. */
  write?: boolean;
  default?: ExtensionValue;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: { value: string; label: string }[];
}

export type ExtensionCard =
  | { type: 'value'; label: string; datapoint: string; unit: string; decimals?: number }
  | { type: 'switch'; label: string; datapoint: string }
  | { type: 'slider'; label: string; datapoint: string; min: number; max: number; step: number; unit: string }
  | { type: 'button'; label: string; datapoint: string; value: string | number | boolean; confirm: string }
  | { type: 'text'; label: string; text: string };

export interface ExtensionPart {
  /** page: title in the navigation (empty = module name). */
  title?: string;
  /** widget: default size [width, height] in grid cells. */
  size?: [number, number];
  /** Own HTML page of the package (shown in a sandbox) … */
  entry?: string;
  /** … or ready-made cards rendered by the app. */
  cards?: ExtensionCard[];
}

/** Clean manifest as sent by the server (schema version 1). */
export interface ExtensionManifest {
  manifestVersion: 1;
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  homepage: string;
  icon: string;
  settings: ExtensionSetting[];
  page: ExtensionPart | null;
  widget: ExtensionPart | null;
}

/** Stored state of one module (`config.extensions[id]`). */
export interface ExtensionConfig {
  enabled: boolean;
  settings: Record<string, ExtensionValue>;
}

/** Entry of the admin list: broken packages have no manifest but an error. */
export interface InstalledExtension {
  id: string;
  manifest: ExtensionManifest | null;
  error: string | null;
}

/** Message protocol between the app and the sandboxed module pages (client/public/module-sdk.js). */
export const BRIDGE_PROTOCOL = 'homeapp-module/1';

const VIEW_PREFIX = 'ext-';
/** Page id of a module in the navigation and the URL hash (`#ext-pool`). */
export const extensionView = (id: string) => `${VIEW_PREFIX}${id}` as `ext-${string}`;
/** Module id of a page id, null for the built-in pages. */
export const extensionIdOf = (view: string) => (view.startsWith(VIEW_PREFIX) ? view.slice(VIEW_PREFIX.length) : null);
export const isExtensionView = (view: string): view is `ext-${string}` => /^ext-[a-z][a-z0-9-]*[a-z0-9]$/.test(view);

/** Defaults of the settings slots (shown until the admin saved own values). */
function extensionDefaults(manifest: ExtensionManifest): ExtensionConfig {
  return {
    enabled: false,
    settings: Object.fromEntries(manifest.settings.map((s) => [s.key, s.type === 'datapoint' ? '' : s.default ?? null])),
  };
}

/** Stored state of a module, or its defaults if there is none yet. */
export const extensionConfig = (manifest: ExtensionManifest, all: Record<string, ExtensionConfig> | undefined): ExtensionConfig =>
  all?.[manifest.id] ?? extensionDefaults(manifest);

/** Modules that are switched on. */
export const activeExtensions = (list: readonly ExtensionManifest[], all: Record<string, ExtensionConfig> | undefined) =>
  list.filter((m) => all?.[m.id]?.enabled === true);

/** Navigation entries of the enabled modules with an own page. */
export const extensionPages = (list: readonly ExtensionManifest[], all: Record<string, ExtensionConfig> | undefined) =>
  activeExtensions(list, all)
    .filter((m) => m.page)
    .map((m) => ({ id: extensionView(m.id), label: m.page?.title || m.name, icon: m.icon }));

/** Required settings slots that are still empty (the module is shown with a hint). */
export const missingSettings = (manifest: ExtensionManifest, cfg: ExtensionConfig) =>
  manifest.settings.filter((s) => s.required && (cfg.settings[s.key] === '' || cfg.settings[s.key] === null || cfg.settings[s.key] === undefined));

/** Real datapoint id behind a settings slot of type datapoint ('' if not mapped). */
export function datapointOf(manifest: ExtensionManifest, cfg: ExtensionConfig, key: string): string {
  const s = manifest.settings.find((x) => x.key === key && x.type === 'datapoint');
  const v = s ? cfg.settings[key] : '';
  return typeof v === 'string' ? v : '';
}

/**
 * Current values of the mapped datapoints, keyed by the settings slot (the module never learns the real
 * ids); null for slots that are not mapped or have no value yet.
 */
export function extensionValues(manifest: ExtensionManifest, cfg: ExtensionConfig, states: Record<string, StateEntry>) {
  const out: Record<string, { val: unknown; ts: number } | null> = {};
  for (const s of manifest.settings) {
    if (s.type !== 'datapoint') continue;
    const id = datapointOf(manifest, cfg, s.key);
    const e = id ? states[id] : undefined;
    out[s.key] = e ? { val: e.val, ts: e.ts } : null;
  }
  return out;
}

/** Values that changed between two snapshots of {@link extensionValues}. */
export function changedValues(prev: Record<string, { val: unknown; ts: number } | null>, next: Record<string, { val: unknown; ts: number } | null>) {
  const out: typeof next = {};
  for (const [k, v] of Object.entries(next)) {
    const p = prev[k];
    if (p === v) continue;
    if (!p || !v || p.val !== v.val || p.ts !== v.ts) out[k] = v;
  }
  return out;
}

/** Message the module page receives first and after every change of the settings or the theme. */
export function initMessage(
  manifest: ExtensionManifest, cfg: ExtensionConfig, states: Record<string, StateEntry>, view: 'page' | 'widget', theme: string, colors: Record<string, string> = {},
) {
  const settings: Record<string, ExtensionValue> = {};
  const datapoints: Record<string, { label: string; write: boolean; mapped: boolean }> = {};
  for (const s of manifest.settings) {
    if (s.type === 'datapoint') datapoints[s.key] = { label: s.label, write: s.write === true, mapped: Boolean(datapointOf(manifest, cfg, s.key)) };
    else settings[s.key] = cfg.settings[s.key] ?? s.default ?? null;
  }
  return {
    protocol: BRIDGE_PROTOCOL,
    type: 'init',
    module: { id: manifest.id, name: manifest.name, version: manifest.version },
    view,
    theme,
    colors,
    settings,
    datapoints,
    values: extensionValues(manifest, cfg, states),
  };
}

export type BridgeRequest =
  | { type: 'ready' }
  | { type: 'resize'; height: number }
  | { type: 'set'; requestId: number; key: string; value: unknown };

/** Message of a module page, or null for foreign / malformed messages. */
export function parseBridgeMessage(data: unknown): BridgeRequest | null {
  if (!data || typeof data !== 'object') return null;
  const m = data as Record<string, unknown>;
  if (m.protocol !== BRIDGE_PROTOCOL) return null;
  if (m.type === 'ready') return { type: 'ready' };
  if (m.type === 'resize' && typeof m.height === 'number' && Number.isFinite(m.height)) return { type: 'resize', height: m.height };
  if (m.type === 'set' && typeof m.key === 'string' && typeof m.requestId === 'number') return { type: 'set', requestId: m.requestId, key: m.key, value: m.value };
  return null;
}

/**
 * Checks a write request of a module: only datapoint slots released with `write: true` that are mapped,
 * and only plain values. Returns the real datapoint id or the reason for the refusal.
 */
export function resolveWrite(manifest: ExtensionManifest, cfg: ExtensionConfig, key: string, value: unknown): { id: string } | { error: string } {
  const s = manifest.settings.find((x) => x.key === key);
  if (!s || s.type !== 'datapoint') return { error: `Unbekannter Datenpunkt "${key}"` };
  if (!s.write) return { error: `"${key}" darf nur gelesen werden` };
  const id = datapointOf(manifest, cfg, key);
  if (!id) return { error: `"${key}" ist keinem Datenpunkt zugeordnet` };
  const ok = value === null || typeof value === 'boolean' || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
  if (!ok) return { error: 'Nur Text, Zahl, true/false oder null können geschrieben werden' };
  if (typeof value === 'string' && value.length > 1000) return { error: 'Der Text ist zu lang' };
  return { id };
}

/** Value of a card as text ("21,5 °C", "an", "–"). */
export function formatCardValue(val: unknown, unit = '', decimals?: number): string {
  if (val === null || val === undefined || val === '') return '–';
  if (typeof val === 'boolean') return val ? 'an' : 'aus';
  if (typeof val === 'number') {
    const text = decimals === undefined ? val.toLocaleString('de-DE', { maximumFractionDigits: 2 }) : val.toLocaleString('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    return unit ? `${text} ${unit}` : text;
  }
  const text = String(val);
  return unit ? `${text} ${unit}` : text;
}
