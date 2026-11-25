/**
 * Ventilation advice per room (dashboard widget). Computed by the server from humidity, CO₂,
 * temperature and the outdoor air (see server ventilation.js).
 */
import { useStore } from '../lib/store';
import { num } from '../lib/format';
import { VENT_REASON, VENT_STATUS } from '../lib/ventilation';
import { HudPanel, toneStyle } from './Hud';

export function VentilationPanel() {
  const data = useStore((s) => s.ventilation);
  const openTarget = useStore((s) => s.openTarget);
  if (!data?.enabled) {
    return (
      <HudPanel title="Lüften" color="#94a3b8">
        <p className="text-sm text-muted">Lüftungsempfehlung ist aus (Einstellungen → Lüftung).</p>
      </HudPanel>
    );
  }
  const out = data.outdoor;
  const outside = out && out.temperature != null ? `Außen ${num(out.temperature, 1)} °C · ${out.humidity ?? '–'} %${out.absHumidity != null ? ` · ${num(out.absHumidity, 1)} g/m³` : ''}` : 'Außenwerte fehlen';
  return (
    <HudPanel title="Lüften" color="#22d3ee" right={<span title={out?.source === 'internet' ? 'Außenwerte aus dem Internet-Wetter' : 'Außenwerte der Wetterstation'}>{outside}</span>}>
      {data.rooms.length === 0 && <p className="text-sm text-muted">Keine Räume mit Luftfeuchte- oder CO₂-Sensor gefunden.</p>}
      <ul className="grid gap-1.5">
        {data.rooms.map((r) => {
          const st = VENT_STATUS[r.status];
          const values = [
            r.co2 != null && `${Math.round(r.co2)} ppm`,
            r.humidity != null && `${Math.round(r.humidity)} %`,
            r.absHumidity != null && `${num(r.absHumidity, 1)} g/m³`,
          ].filter(Boolean);
          const why = r.reasons.map((x) => VENT_REASON[x] ?? x).join(', ');
          return (
            <li key={r.id}>
              <button
                className="w-full flex items-center gap-3 rounded-xl px-2.5 py-1.5 text-left hover:bg-white/5 transition"
                style={toneStyle(r.status === 'ventilate' && r.severity === 'warning' ? '#f43f5e' : st.color)}
                title={r.message || undefined}
                onClick={() => openTarget('rooms', r.room)}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-[var(--tone)] shadow-[0_0_8px_var(--tone)]" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate">{r.name}</span>
                  <span className="block text-xs text-muted truncate">{values.join(' · ') || '–'}</span>
                </span>
                <span className="text-xs font-semibold text-[var(--tone)] text-right shrink-0">
                  {st.label}
                  {why && <span className="block font-normal text-muted">{why}</span>}
                  {!why && r.humidOutside && <span className="block font-normal text-muted">außen feuchter</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </HudPanel>
  );
}
