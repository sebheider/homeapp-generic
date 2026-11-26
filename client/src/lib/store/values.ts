/** Hooks that read datapoint values from the store, and the boolean convention of ioBroker. */
import { useShallow } from 'zustand/react/shallow';
import type { StateEntry } from '../types';
import { useStore } from '../store';

/**
 * Reads several datapoints at once: maps `{ key: stateId }` to `{ key: value }`.
 * The result is shallow compared, so the component only re-renders when one of the values changes.
 */
export const useStateValues = (ids: Record<string, string>): Record<string, unknown> =>
  useStore(useShallow((s) => Object.fromEntries(Object.entries(ids).map(([k, id]) => [k, s.states[id]?.val]))));

/**
 * Entries of the given datapoints only (missing ones are left out). The result is shallow compared, so
 * the component only re-renders when one of these datapoints changes – not on every value of the house.
 * Pass a stable (memoised) id list.
 */
export const useStateEntries = (ids: readonly string[]): Record<string, StateEntry> =>
  useStore(
    useShallow((s) => {
      const out: Record<string, StateEntry> = {};
      for (const id of ids) {
        const e = s.states[id];
        if (e) out[id] = e;
      }
      return out;
    }),
  );

/** ioBroker booleans may arrive as true/1/"1"/"true"/"on". */
export const isOn = (v: unknown) => v === true || v === 1 || v === '1' || v === 'true' || v === 'on';
