import type { PreferenceKey } from "@holdline/types";

export interface Priorities {
  /** Preference keys that produce bid lines, most important first. */
  order: PreferenceKey[];
  /** Keys that produce lines but are missing from `intent.priorities`. Appended to `order` as least important. */
  unranked: PreferenceKey[];
}

/**
 * Effective ranking shared by every compiler: the intent's order (deduped, keys that produce no lines
 * skipped), then any unranked keys that do produce lines, in the order given by `active`.
 */
export function resolvePriorities(
  ranked: readonly PreferenceKey[],
  active: readonly PreferenceKey[],
): Priorities {
  const isActive = new Set(active);
  const order = [...new Set(ranked)].filter((k) => isActive.has(k));
  const unranked = active.filter((k) => !order.includes(k));
  return { order: [...order, ...unranked], unranked };
}

export interface RelaxStep {
  /** Preferences this group/layer still bids for, most important first. */
  keep: PreferenceKey[];
  /** Preferences dropped relative to the first step, in priority order. */
  dropped: PreferenceKey[];
}

/**
 * Bid groups/layers for dialects where PBS moves to the next group when one can't be filled.
 * Step N keeps `order` minus its last N-1 keys. The final step keeps none: hard constraints only.
 * With `maxGroups`, the strictest `maxGroups - 1` steps plus the final step survive; the rest are
 * returned in `skipped` so the caller can warn.
 */
export function relaxationSteps(
  order: readonly PreferenceKey[],
  maxGroups?: number,
): { steps: RelaxStep[]; skipped: RelaxStep[] } {
  const all: RelaxStep[] = [];
  for (let n = order.length; n >= 0; n--) {
    all.push({ keep: order.slice(0, n), dropped: order.slice(n) });
  }
  if (maxGroups === undefined || all.length <= maxGroups) return { steps: all, skipped: [] };
  if (maxGroups < 1) throw new RangeError(`maxGroups must be >= 1, got ${maxGroups}`);
  const final = all[all.length - 1]!;
  return { steps: [...all.slice(0, maxGroups - 1), final], skipped: all.slice(maxGroups - 1, -1) };
}
