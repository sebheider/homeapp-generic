import type { Overview } from '../../../lib/overview';
import { widgetPart, type Widget } from '../../../lib/widgets';
import type { EnergyValues } from '../../../components/Energy';
import { useGaugeTiles } from '../../dashboard/Gauges';
import { WidgetNote } from './WidgetNote';

/** One gauge of the overview (`kind` option), or a hint if its data is missing. */
export function GaugeWidget({ o, energy, w }: { o: Overview; energy: EnergyValues; w: Widget }) {
  const tile = useGaugeTiles(o, energy, true).find((t) => t.key === w.options.kind);
  const label = widgetPart(w)?.label ?? 'Messinstrument';
  return tile ?? <WidgetNote type="gauge" title={label} text="Für dieses Messinstrument fehlen die Daten." />;
}
