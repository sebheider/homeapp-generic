/** Small figure with a coloured top line. */
export function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl px-3 py-2 border border-line" style={{ background: `color-mix(in srgb, ${color} 8%, transparent)`, borderTop: `2px solid ${color}` }}>
      <div className="text-[0.65rem] text-muted uppercase tracking-wider truncate">{label}</div>
      <div className="font-bold tabular-nums">{value}</div>
    </div>
  );
}
