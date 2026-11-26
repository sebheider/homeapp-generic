import { WIDGETS, type WidgetType } from '../../../lib/widgets';
import { HudPanel } from '../../../components/Hud';
import { C } from '../../dashboard/colors';
import { ICONS } from '../shared';

/** Panel with a short hint, for widgets whose data is missing (e.g. no energy system configured). */
export function WidgetNote({ type, title, text }: { type: WidgetType; title?: string; text: string }) {
  const I = ICONS[type];
  return (
    <HudPanel title={title ?? WIDGETS[type].label} color={C.violet} bodyClassName="flex items-center gap-2 text-sm text-muted">
      <I size={16} className="shrink-0" /> {text}
    </HudPanel>
  );
}
