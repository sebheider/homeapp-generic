/** Settings tab "Allgemein": app name, version and installation. */
import { Download, Sparkles } from 'lucide-react';
import { useStore } from '../../lib/store';
import { VERSION } from '../../lib/version';
import { isStandalone, useInstallPrompt } from '../../lib/pwa';
import { Card, Field, sectionSetter, type TabProps } from './shared';

/** General app settings and installation information. */
export function GeneralTab({ draft, setDraft }: TabProps) {
  const a = draft.app;
  const set = sectionSetter(draft, setDraft, 'app');
  return (
    <>
      <Card title="Allgemein">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Name der App"><input className="field" value={a.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        </div>
      </Card>
      <AboutCard />
    </>
  );
}

/** Version, release notes and installation as an app. */
function AboutCard() {
  const showChangelog = useStore((s) => s.showChangelog);
  const toast = useStore((s) => s.toast);
  const { available, install } = useInstallPrompt();
  const standalone = isStandalone();
  return (
    <Card title="Über die App">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm">HomeApp <b>Version {VERSION}</b></span>
        <button className="btn" onClick={() => showChangelog(true)}><Sparkles size={15} /> Was ist neu?</button>
        {available && (
          <button className="btn primary" onClick={async () => (await install()) && toast('App wird installiert', 'success')}>
            <Download size={15} /> Als App installieren
          </button>
        )}
      </div>
      <p className="text-xs text-muted mt-3">
        {standalone
          ? 'Die App läuft installiert (ohne Browserleisten).'
          : window.isSecureContext
            ? 'Android: Im Chrome-Menü (⋮) „App installieren“ bzw. „Zum Startbildschirm hinzufügen“ wählen – die App startet dann im eigenen Fenster ohne Browserleisten.'
            : 'Hinweis: Als echte App (ohne Browserleisten) lässt sich die Seite nur über HTTPS installieren. Über http im Heimnetz legt Chrome lediglich eine Verknüpfung an – siehe README „Als App auf Android installieren“.'}
      </p>
    </Card>
  );
}
