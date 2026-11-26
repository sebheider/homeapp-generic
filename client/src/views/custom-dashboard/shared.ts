/** Helpers shared by the widgets and the editor of the own start page. */
import { useMemo } from 'react';
import { Activity, AirVent, Camera, Clock3, CloudSun, DoorOpen, Gauge, House, LayoutDashboard, Lightbulb, Music, Printer3d, Puzzle, Recycle, Shield, Sparkles, ToggleRight, Type, Umbrella, Wind, Zap, type LucideIcon } from 'lucide-react';
import { useStore } from '../../lib/store';
import { activeExtensions } from '../../lib/extensions';
import { WIDGETS, widgetPart, type Widget, type WidgetType } from '../../lib/widgets';

export const ICONS: Record<WidgetType, LucideIcon> = {
  clock: Clock3, status: House, weather: CloudSun, weatherPart: Umbrella, gauge: Gauge, energy: Zap, energyPart: Activity, security: Shield, camera: Camera,
  rooms: LayoutDashboard, room: DoorOpen, scenes: Sparkles, lights: Lightbulb, devices: ToggleRight, text: Type, printer: Printer3d, spotify: Music,
  waste: Recycle, ventilation: AirVent, kiosk: Wind, extension: Puzzle,
};

export const str = (v: unknown) => (typeof v === 'string' ? v : '');
export const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Name of a widget in the editor: the chosen part (gauge, weather or energy detail), the own title or the module name, otherwise the name of the widget type. */
export const widgetLabel = (w: Widget) =>
  widgetPart(w)?.label
  || ((w.type === 'devices' || w.type === 'text') && str(w.options.title))
  || (w.type === 'extension' && useStore.getState().extensions.find((m) => m.id === str(w.options.extension))?.name)
  || WIDGETS[w.type].label;

/** Enabled external modules that bring a widget for the start page. */
export function useWidgetModules() {
  const extensions = useStore((s) => s.extensions);
  const all = useStore((s) => s.config?.extensions);
  return useMemo(() => activeExtensions(extensions, all).filter((m) => m.widget), [extensions, all]);
}
