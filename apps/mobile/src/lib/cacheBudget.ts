// A size budget, with least-recently-used eviction, for caches the app fills on
// its own.
//
// The distinction that matters: this is for content the app decided to cache,
// not content the USER asked for. A downloaded Bible translation is an explicit
// choice with its own delete control (OfflineDownloadsScreen) and must never be
// evicted behind the user's back — being offline with a translation they
// deliberately saved is the whole feature. Devotional months, by contrast,
// accumulate silently as the reader is used: nobody asked for them, nobody
// prunes them, and nothing bounded them.
//
// The planner is pure so the policy is unit-tested rather than inferred from
// filesystem behaviour; the sweep around it does the I/O.

export type CacheEntry = {
  /** Path relative to the cache root — what the caller will delete. */
  path: string
  bytes: number
  /** Last access (or write) time, ms since epoch. Oldest is evicted first. */
  lastUsedMs: number
}

/**
 * Which entries to delete to bring `entries` under `budgetBytes`.
 *
 * Evicts strictly oldest-first and stops as soon as the total fits, so a cache
 * already under budget plans nothing and the common case costs no writes.
 * `keep` names paths that are never evictable (an index or manifest, without
 * which the rest of the cache is unreadable — dropping it would strand every
 * file it describes rather than freeing anything useful).
 */
export function planEviction(
  entries: CacheEntry[],
  budgetBytes: number,
  keep: readonly string[] = [],
): string[] {
  const protectedPaths = new Set(keep)
  const total = entries.reduce((sum, e) => sum + Math.max(0, e.bytes), 0)
  if (total <= budgetBytes) return []

  const evictable = entries
    .filter((e) => !protectedPaths.has(e.path))
    .sort((a, b) => a.lastUsedMs - b.lastUsedMs)

  const evicted: string[] = []
  let remaining = total
  for (const entry of evictable) {
    if (remaining <= budgetBytes) break
    evicted.push(entry.path)
    remaining -= Math.max(0, entry.bytes)
  }
  return evicted
}

/**
 * Default budget for the devotional cache: 8 MB.
 *
 * A cached month is tens of KB, so this holds years of reading — the budget is a
 * backstop against unbounded growth over the life of an install, not a limit a
 * normal reader is expected to reach. Deliberately small: this content re-fetches
 * in a moment, so the cost of evicting too eagerly is far lower than the cost of
 * quietly occupying a phone that has no space left.
 */
export const DEVOTIONAL_CACHE_BUDGET_BYTES = 8 * 1024 * 1024
