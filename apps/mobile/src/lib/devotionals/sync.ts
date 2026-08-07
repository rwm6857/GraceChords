import { shouldCheck, staleMonths, withCachedMonth, withCheckedAt } from '@gracechords/core/devotional/manifest'
import { fetchManifest, fetchMonth } from './remote'
import { cacheManifest, cacheMonth, invalidateMemo, readCachedManifest } from './source'
import { hydrateSyncState, putSyncState, syncStateSnapshot } from './syncState'

// Background sync against R2.
//
//   * At most once a day. The manifest carries a short TTL and content changes
//     rarely; checking on every launch would be pure waste.
//   * Never on the read path. Rendering does not await this, ever.
//   * Silent. Any failure leaves the cache as it was and surfaces nothing.
//   * Per-month. Editing one entry refetches one ~35 KB file, not all twelve,
//     because the manifest carries a hash per month rather than one global hash.
//
// Fetch-on-demand for a month the user actually needs lives in source.ts
// (`ensureMonth`) and is deliberately NOT throttled — this throttle governs the
// periodic "has anything changed" check, not "get me today's content".

let running: Promise<SyncResult> | null = null

export type SyncResult = {
  checked: boolean
  updated: string[]
  failed: string[]
}

const IDLE: SyncResult = { checked: false, updated: [], failed: [] }

/**
 * Run a sync if one is due. Fire-and-forget: callers should not await this on a
 * render path. Concurrent calls share one run.
 *
 * `force` skips only the time throttle, not the hash comparison — a forced sync
 * with unchanged content still downloads nothing.
 */
export function syncDevotionals(opts: { force?: boolean, now?: number } = {}): Promise<SyncResult> {
  if (running) return running
  running = run(opts).catch(() => IDLE).finally(() => { running = null })
  return running
}

async function run({ force = false, now = Date.now() }: { force?: boolean, now?: number }): Promise<SyncResult> {
  await hydrateSyncState()
  const state = syncStateSnapshot()

  // A device with no manifest yet has nothing to serve, so it checks regardless
  // of the throttle — otherwise a first launch that missed its window would sit
  // empty for a day.
  const haveManifest = Boolean(await readCachedManifest())
  if (!force && haveManifest && !shouldCheck(state, now)) return IDLE

  const fetched = await fetchManifest()
  if (!fetched) return IDLE

  await cacheManifest(fetched.manifest, fetched.text)
  let next = withCheckedAt(state, now)

  const updated: string[] = []
  const failed: string[] = []

  for (const monthKey of staleMonths(fetched.manifest, state)) {
    const entry = fetched.manifest.months[monthKey]
    // Hash-verified inside fetchMonth; a mismatch discards the download and
    // leaves the previous copy in place.
    const got = await fetchMonth(entry.file, entry.hash)
    if (!got) { failed.push(monthKey); continue }
    if (!(await cacheMonth(monthKey, got.month, got.text))) { failed.push(monthKey); continue }
    next = withCachedMonth(next, monthKey, entry.hash)
    updated.push(monthKey)
  }

  putSyncState(next)
  if (updated.length) invalidateMemo()

  if (__DEV__ && (updated.length || failed.length)) {
    console.log(`[devotionals] sync: updated ${updated.join(',') || 'none'}${failed.length ? `, failed ${failed.join(',')}` : ''}`)
  }
  return { checked: true, updated, failed }
}
