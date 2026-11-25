/**
 * Checks whether the ioBroker user may write the datapoints the app controls. ioBroker checks the
 * rights of every object in addition to the group rights, so "State write" in the group is not enough
 * for datapoints owned by the administrator group. Offers the fix as a script for the javascript adapter.
 */
import { useState } from 'react';
import { api, type PermissionReport } from '../../lib/api';
import { CodeBlock } from './shared';

/** "system.group.administrator" -> "administrator". */
const groupName = (id?: string) => (id ?? '').replace('system.group.', '');

/** Card with a "check now" button and the result (blocked datapoints plus two ways to fix them). */
export function WriteAccessCard() {
  const [report, setReport] = useState<PermissionReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const check = () => {
    setBusy(true);
    setError(null);
    api
      .permissions()
      .then(setReport)
      .catch((e: Error) => {
        setReport(null);
        setError(e.message);
      })
      .finally(() => setBusy(false));
  };
  return (
    <div className="mt-4 rounded-2xl border border-line p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-semibold text-sm">Schreibrechte prüfen</div>
          <p className="text-xs text-muted">Meldet die App „Keine Schreibberechtigung“, obwohl die Gruppenrechte passen, liegt es an den Rechten der einzelnen Datenpunkte.</p>
        </div>
        <button className="btn" disabled={busy} onClick={check}>{busy ? 'Prüfe …' : 'Jetzt prüfen'}</button>
      </div>
      {error && <p className="text-sm text-rose-400 mt-3">{error}</p>}
      {report?.anonymous && <p className="text-sm text-muted mt-3">Ohne Benutzer (anonymer Zugriff) gelten die Rechte des Adapters – hier ist nichts zu prüfen.</p>}
      {report && !report.anonymous && <ReportDetails report={report} />}
    </div>
  );
}

/** Result of a check for a logged-in user. */
function ReportDetails({ report }: { report: PermissionReport }) {
  const first = report.blocked[0];
  return (
    <div className="mt-3 text-sm">
      <p className="text-muted text-xs mb-2">
        Benutzer <code>{report.user}</code> in Gruppe(n): {report.groups?.length ? report.groups.map(groupName).join(', ') : 'keine'} · {report.total} gesteuerte Datenpunkte geprüft
      </p>
      {!report.groupsAllowWrite && (
        <p className="text-rose-400">Keine Gruppe des Benutzers hat „State permissions → write“. Das im ioBroker-Admin unter Benutzer/Gruppen aktivieren.</p>
      )}
      {report.groupsAllowWrite && report.blocked.length === 0 && <p className="text-emerald-300">✓ Alle {report.total} Datenpunkte sind beschreibbar.</p>}
      {report.blocked.length > 0 && (
        <>
          <p className="text-amber-300">
            {report.blocked.length} von {report.total} Datenpunkten sind für <code>{report.user}</code> schreibgeschützt: Sie gehören {groupName(first.owner)} / Gruppe {groupName(first.ownerGroup)} und erlauben „Anderen“ nur Lesen.
          </p>
          <p className="text-xs text-muted mt-2 mb-1">
            <b className="text-fg">Lösung A (empfohlen):</b> Skript im ioBroker-Adapter <i>javascript</i> als neues Skript anlegen und einmal starten. Es setzt bei genau diesen Datenpunkten das Recht „Andere dürfen schreiben“. Nach neu hinzugefügten Geräten erneut prüfen und das Skript noch einmal ausführen.
          </p>
          <CodeBlock text={report.script} />
          <p className="text-xs text-muted mt-2">
            <b className="text-fg">Lösung B (einfacher, aber weitreichend):</b> den Benutzer <code>{report.user}</code> zusätzlich der Gruppe <code>{groupName(first.ownerGroup)}</code> hinzufügen. Dann hat er alle Rechte dieser Gruppe, auch zum Löschen und Anlegen.
          </p>
          <details className="mt-2 text-xs text-muted">
            <summary className="cursor-pointer">Betroffene Datenpunkte anzeigen</summary>
            <ul className="mt-1 font-mono break-all max-h-40 overflow-auto">{report.blocked.map((b) => <li key={b.id}>{b.id}</li>)}</ul>
          </details>
        </>
      )}
      {report.missing && report.missing.length > 0 && <p className="text-xs text-muted mt-2">Nicht gefunden (falsche ID?): {report.missing.join(', ')}</p>}
    </div>
  );
}
