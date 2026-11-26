import { pad2 } from '../../lib/format';
import { useNow } from '../../lib/hooks';

/**
 * Big digital clock with blinking colon and a bar that fills up during the minute. `compact`: smaller
 * (widgets); `large`: as big as the kiosk hero allows, readable from across the room.
 */
export function HeroClock({ compact = false, large = false }: { compact?: boolean; large?: boolean }) {
  const d = new Date(useNow(1000));
  const s = d.getSeconds();
  const size = large ? 'text-[5.75rem]' : compact ? 'text-[3.6rem]' : 'text-6xl sm:text-7xl';
  const secSize = large ? 'text-3xl' : compact ? 'text-xl' : 'text-xl sm:text-2xl';
  return (
    <div>
      <div className={`hud-clock font-bold leading-none hud-glow-text ${size}`}>
        {pad2(d.getHours())}
        <span className="hud-colon">:</span>
        {pad2(d.getMinutes())}
        <span className={`${secSize} text-muted font-semibold ml-2 align-top`}>{pad2(s)}</span>
      </div>
      <div className={`${compact && !large ? 'mt-2' : 'mt-3'} ${large ? 'h-1 max-w-[24rem]' : 'h-[3px] max-w-[18rem]'} w-full rounded-full bg-[var(--track)] overflow-hidden`}>
        {/* no transition when the minute starts over, otherwise the bar would run backwards */}
        <div className="h-full rounded-full" style={{ width: `${((s + 1) / 60) * 100}%`, background: 'var(--tone)', boxShadow: '0 0 10px var(--tone)', transition: s === 0 ? 'none' : 'width 1s linear' }} />
      </div>
    </div>
  );
}
