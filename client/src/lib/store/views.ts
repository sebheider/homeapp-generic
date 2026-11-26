/** Pages of the app and the colour scheme. */
import { isExtensionView } from '../extensions';

/** Built-in pages of the app; the current one is mirrored in the URL hash (`#energy`). */
const VIEWS = ['home', 'weather', 'rooms', 'lights', 'climate', 'energy', 'cameras', 'spotify', 'printer', 'mower', 'radar', 'settings'] as const;
/** A built-in page. */
export type BuiltinView = (typeof VIEWS)[number];
/** A page of the app: a built-in page or the page of an external module (`ext-<id>`). */
export type View = BuiltinView | `ext-${string}`;
/** Colour scheme; stored in localStorage. */
export type Theme = 'dark' | 'light';

/** Type guard for strings coming from the URL hash. */
export const isView = (v: string): v is View => (VIEWS as readonly string[]).includes(v) || isExtensionView(v);

/** The view named in the current URL hash, or null if the hash is empty / unknown. */
export const viewFromHash = (): View | null => {
  const h = location.hash.replace('#', '');
  return isView(h) ? h : null;
};
