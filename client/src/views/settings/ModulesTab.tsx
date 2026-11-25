import { Card, Switch, type TabProps } from './shared';

const modules = [
  ['weather', 'Wetter'],
  ['printer', '3D-Drucker'],
  ['spotify', 'Spotify'],
  ['mower', 'Mähroboter'],
] as const;

export function ModulesTab({ draft, setDraft }: TabProps) {
  return (
    <Card title="Optionale Module">
      <p className="text-sm text-muted mb-3">Deaktivierte Module bleiben konfiguriert und können später wieder aktiviert werden. Änderungen gelten nach dem Speichern.</p>
      {modules.map(([id, label]) => (
        <Switch key={id} label={label} checked={draft.modules[id]} onChange={(enabled) => setDraft({ ...draft, modules: { ...draft.modules, [id]: enabled } })} />
      ))}
    </Card>
  );
}
