/**
 * App version and release notes. Both come from CHANGELOG.md in the project root, which is
 * bundled at build time: the version is the first "## [x.y.z]" heading.
 */
import changelog from '../../../CHANGELOG.md?raw';

/** Full release notes (Markdown). */
const CHANGELOG = changelog;

/** Version of this build, e.g. "1.5.0". */
export const VERSION = /^## \[(\d+\.\d+\.\d+[^\]]*)\]/m.exec(changelog)?.[1] ?? 'dev';

/** One release of the changelog: version, date and its Markdown body. */
export interface Release {
  version: string;
  date: string;
  body: string;
}

/** Splits the changelog into releases (newest first, as in the file). */
export function releases(text = CHANGELOG): Release[] {
  return text
    .split(/^## /m)
    .slice(1)
    .map((block) => {
      const [head, ...rest] = block.split('\n');
      const m = /^\[([^\]]+)\]\s*[–-]?\s*(.*)$/.exec(head.trim());
      return { version: m?.[1] ?? head.trim(), date: m?.[2] ?? '', body: rest.join('\n').trim() };
    });
}
