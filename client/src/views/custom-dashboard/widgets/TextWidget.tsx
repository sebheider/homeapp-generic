import type { Widget } from '../../../lib/widgets';
import { HudPanel } from '../../../components/Hud';
import { C } from '../../dashboard/colors';
import { str } from '../shared';

/** Free text with an optional title. */
export function TextWidget({ w }: { w: Widget }) {
  const title = str(w.options.title);
  return (
    <HudPanel title={title || undefined} color={C.violet}>
      <p className="text-sm whitespace-pre-wrap break-words">{str(w.options.text)}</p>
    </HudPanel>
  );
}
