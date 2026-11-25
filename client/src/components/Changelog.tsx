/**
 * "Was ist neu": version label and the release notes dialog. The notes are rendered from the
 * bundled CHANGELOG.md with a tiny Markdown subset (headings, lists, bold, italic, code, links) –
 * no HTML is injected. After an update the dialog opens once by itself.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { useStore } from '../lib/store';
import { VERSION, releases } from '../lib/version';
import { Modal } from './ui';

const SEEN_KEY = 'seenVersion';
/** Number of releases shown before "Ältere Versionen anzeigen". */
const INITIAL_RELEASES = 3;

/** Inline Markdown: **bold**, *italic*, `code` and [links](url). */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const key = out.length;
    if (t.startsWith('**')) out.push(<b key={key}>{t.slice(2, -2)}</b>);
    else if (t.startsWith('`')) out.push(<code key={key} className="text-[0.85em] bg-black/20 rounded px-1">{t.slice(1, -1)}</code>);
    else if (t.startsWith('[')) {
      const [, label, href] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(t)!;
      out.push(<a key={key} href={href} target="_blank" rel="noreferrer" className="underline">{label}</a>);
    } else out.push(<i key={key}>{t.slice(1, -1)}</i>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Block Markdown of one release: "### " sub-headings and "- " list items (paragraphs otherwise). */
function MarkdownBlock({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: ReactNode[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={blocks.length} className="list-disc pl-5 space-y-1 mb-3">{list}</ul>);
    list = [];
  };
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('- ')) list.push(<li key={list.length}>{inline(t.slice(2))}</li>);
    else if (t.startsWith('### ')) {
      flush();
      blocks.push(<h4 key={blocks.length} className="section-title mt-3 mb-1.5">{t.slice(4)}</h4>);
    } else {
      flush();
      blocks.push(<p key={blocks.length} className="mb-2">{inline(t)}</p>);
    }
  }
  flush();
  return <div className="text-sm leading-relaxed">{blocks}</div>;
}

/** Release notes dialog; opens once by itself when the app was updated since the last visit. */
export function ChangelogDialog() {
  const open = useStore((s) => s.changelogOpen);
  const show = useStore((s) => s.showChangelog);
  const [all, setAll] = useState(false);
  const list = useMemo(() => releases(), []);

  useEffect(() => {
    const seen = localStorage.getItem(SEEN_KEY);
    // not on the very first visit, only after an update
    if (seen && seen !== VERSION) show(true);
    localStorage.setItem(SEEN_KEY, VERSION);
  }, []);

  const shown = all ? list : list.slice(0, INITIAL_RELEASES);
  return (
    <Modal open={open} onClose={() => show(false)} title={`Was ist neu – Version ${VERSION}`}>
      {shown.map((r, i) => (
        <section key={r.version} className={i ? 'mt-5 pt-4 border-t border-line' : ''}>
          <div className="flex items-baseline gap-2 mb-2">
            <h3 className="text-base font-semibold">Version {r.version}</h3>
            {i === 0 && <span className="chip on !py-0.5 !text-[0.7rem]">aktuell</span>}
            <span className="text-xs text-muted ml-auto">{r.date}</span>
          </div>
          <MarkdownBlock text={r.body} />
        </section>
      ))}
      {!all && list.length > INITIAL_RELEASES && (
        <button className="btn w-full mt-3" onClick={() => setAll(true)}>Ältere Versionen anzeigen ({list.length - INITIAL_RELEASES})</button>
      )}
    </Modal>
  );
}

/** Small "Version x.y.z" link that opens the release notes. */
export function VersionLink({ className = '' }: { className?: string }) {
  const show = useStore((s) => s.showChangelog);
  return (
    <button className={`inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg ${className}`} onClick={() => show(true)} title="Was ist neu?">
      <Sparkles size={12} /> Version {VERSION}
    </button>
  );
}
