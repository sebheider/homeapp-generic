import { Puzzle } from 'lucide-react';
import { useStore } from '../../../lib/store';
import { WIDGETS, type Widget } from '../../../lib/widgets';
import { HudPanel } from '../../../components/Hud';
import { ExtensionWidgetBody } from '../../../components/Extension';
import { C } from '../../dashboard/colors';
import { str } from '../shared';

/** Widget of an external module: its cards or its own page in the sandbox. */
export function ExtensionWidget({ w }: { w: Widget }) {
  const id = str(w.options.extension);
  const manifest = useStore((s) => s.extensions.find((m) => m.id === id));
  return (
    <HudPanel title={manifest?.name ?? WIDGETS.extension.label} color={C.violet} bodyClassName={manifest?.widget?.entry ? 'flex flex-col' : ''}>
      <ExtensionWidgetBody id={id} note={(text) => <div className="flex items-center gap-2 text-sm text-muted"><Puzzle size={16} className="shrink-0" /> {text}</div>} />
    </HudPanel>
  );
}
