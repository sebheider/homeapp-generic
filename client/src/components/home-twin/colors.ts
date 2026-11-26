/** Colours of the digital twin (shared with the "Nexus" design) and its temperature scale. */

export const NX = { cyan: '#22e4ff', amber: '#ffb020', red: '#ff4d6d', orange: '#ff8a3d', green: '#2dffa8', violet: '#8b5cf6', magenta: '#ff3fd8', muted: '#7d90b5' };

/** Colour scale of room temperatures: cold blue … comfortable green … hot red. */
const STOPS: [number, number[]][] = [[17, [59, 130, 246]], [19.5, [34, 228, 255]], [21, [45, 255, 168]], [22.4, [255, 176, 32]], [24, [255, 77, 109]]];
export function tempColor(t: number | null) {
  if (t == null) return NX.cyan;
  if (t <= STOPS[0][0]) return `rgb(${STOPS[0][1]})`;
  for (let k = 1; k < STOPS.length; k++) {
    if (t > STOPS[k][0]) continue;
    const [t0, c0] = STOPS[k - 1];
    const [t1, c1] = STOPS[k];
    const f = (t - t0) / (t1 - t0);
    return `rgb(${c0.map((v, j) => Math.round(v + (c1[j] - v) * f))})`;
  }
  return `rgb(${STOPS[STOPS.length - 1][1]})`;
}
