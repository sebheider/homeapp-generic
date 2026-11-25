import { useEffect, useState } from 'react';
import { frameStats, type FrameStats } from '../lib/perf';

/**
 * Small overlay with frame rate, longest frame and number of running animations (`?fps=1`).
 * Measures over the last two seconds and updates once per second.
 */
export function FpsMeter() {
  const [stats, setStats] = useState<FrameStats & { anims: number }>({ fps: 0, worst: 0, jank: 0, anims: 0 });
  useEffect(() => {
    let times: number[] = [];
    let raf = 0;
    const frame = (t: number) => {
      times.push(t);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const timer = setInterval(() => {
      const now = performance.now();
      times = times.filter((t) => now - t < 2000);
      const anims = typeof document.getAnimations === 'function' ? document.getAnimations().length : 0;
      setStats({ ...frameStats(times), anims });
    }, 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(timer);
    };
  }, []);
  const tone = stats.fps >= 50 ? '#34d399' : stats.fps >= 30 ? '#fbbf24' : '#f87171';
  return (
    <div className="fps-meter" aria-hidden>
      <b style={{ color: tone }}>{stats.fps} fps</b>
      <span>max {stats.worst} ms</span>
      <span>{Math.round(stats.jank * 100)} % ruckelig</span>
      <span>{stats.anims} Animationen</span>
    </div>
  );
}
