import { parseManifest, parseMonthFile } from '@gracechords/core/devotional/manifest'
import { monthOfDayKey } from '@gracechords/core/devotional/dayKey'
import { selectDay } from '@gracechords/core/devotional/selection'
import type { DayEntry, Manifest, MonthFile } from '@gracechords/core/devotional/types'
import { manifestRelPath, monthRelPath, tmpRelPath } from './paths'
import { readCachedText, writeCachedTextAtomic } from './cacheStore'
import { fetchManifest, fetchMonth } from './remote'

// Read seam for devotional content.
//
// There is NO bundled baseline: content is fetched from R2 and cached, so it can
// be changed remotely without shipping a binary. The cache is therefore the only
// local source, and the trade-off is that a fresh install has nothing until a
// fetch lands.
//
// What that costs, and what it must not cost:
//
//   * Rendering NEVER waits on the network. A cache miss resolves to null
//     immediately; the fetch happens behind it and the caller re-renders when it
//     lands. There is no spinner — an absent card is honest, a spinner over
//     content that may not exist is not.
//   * Every failure is silent. Offline, timeout, bad JSON, hash mismatch: the
//     slot stays empty. The devotional is supplementary and must never disturb
//     the readings.
//   * A cached month is served without any network call at all, so the common
//     case after first launch is a pure local read.

/**
 * Parsed months, memoized so a month is validated once per session. Capped
 * least-recently-used: free date-picker navigation would otherwise hold every
 * month ever opened, and a month is ~30 days of prose. Same shape as the cap in
 * src/lib/recents.ts; a miss just re-reads the cached text off disk.
 */
const MAX_MEMOIZED_MONTHS = 6
const monthMemo = new Map<string, MonthFile>()

function readMonthMemo(monthKey: string): MonthFile | undefined {
  const hit = monthMemo.get(monthKey)
  if (!hit) return undefined
  monthMemo.delete(monthKey)
  monthMemo.set(monthKey, hit)
  return hit
}

function writeMonthMemo(monthKey: string, month: MonthFile): void {
  monthMemo.delete(monthKey)
  monthMemo.set(monthKey, month)
  for (const stale of [...monthMemo.keys()].slice(0, Math.max(0, monthMemo.size - MAX_MEMOIZED_MONTHS))) {
    monthMemo.delete(stale)
  }
}
/** In-flight month fetches, so two cards on one day don't fetch twice. */
const inFlight = new Map<string, Promise<MonthFile | null>>()
let manifestMemo: Manifest | null = null

// ── Cache reads ─────────────────────────────────────────────────────────────

/** The cached month, or null. No network. */
export async function readCachedMonth(monthKey: string): Promise<MonthFile | null> {
  const hit = readMonthMemo(monthKey)
  if (hit) return hit
  const text = await readCachedText(monthRelPath(monthKey))
  if (!text) return null
  try {
    const parsed = parseMonthFile(JSON.parse(text) as unknown)
    if (!parsed) return null
    writeMonthMemo(monthKey, parsed)
    return parsed
  } catch {
    return null
  }
}

/**
 * The cached manifest, or null. Cached so the device knows a month's remote path
 * (which embeds the content version) even when offline.
 */
export async function readCachedManifest(): Promise<Manifest | null> {
  if (manifestMemo) return manifestMemo
  const text = await readCachedText(manifestRelPath())
  if (!text) return null
  try {
    manifestMemo = parseManifest(JSON.parse(text) as unknown)
    return manifestMemo
  } catch {
    return null
  }
}

// ── Writes ──────────────────────────────────────────────────────────────────

export async function cacheManifest(manifest: Manifest, text: string): Promise<boolean> {
  const ok = await writeCachedTextAtomic(tmpRelPath('manifest.json'), manifestRelPath(), text)
  if (ok) manifestMemo = manifest
  return ok
}

export async function cacheMonth(monthKey: string, month: MonthFile, text: string): Promise<boolean> {
  const ok = await writeCachedTextAtomic(tmpRelPath(`${monthKey}.json`), monthRelPath(monthKey), text)
  if (ok) writeMonthMemo(monthKey, month)
  return ok
}

// ── Fetch-on-demand ─────────────────────────────────────────────────────────

/**
 * Ensure one month is on disk, fetching it if absent. Resolves to the month or
 * null. Callers must not block rendering on this.
 *
 * Deduplicated per month: a two-devotional day rendering two cards triggers one
 * fetch, not two.
 */
export function ensureMonth(monthKey: string): Promise<MonthFile | null> {
  const existing = inFlight.get(monthKey)
  if (existing) return existing

  const work = (async () => {
    const cached = await readCachedMonth(monthKey)
    if (cached) return cached

    // Need the manifest for the month's versioned path and its expected hash.
    let manifest = await readCachedManifest()
    if (!manifest) {
      const fetched = await fetchManifest()
      if (!fetched) return null
      await cacheManifest(fetched.manifest, fetched.text)
      manifest = fetched.manifest
    }

    const entry = manifest.months[monthKey]
    if (!entry) return null

    const got = await fetchMonth(entry.file, entry.hash)
    if (!got) return null
    await cacheMonth(monthKey, got.month, got.text)
    return got.month
  })()
    .catch(() => null)
    .finally(() => { inFlight.delete(monthKey) })

  inFlight.set(monthKey, work)
  return work
}

// ── Day lookup ──────────────────────────────────────────────────────────────

/**
 * A day's devotionals from cache only. Null when the month is not cached yet.
 *
 * Returns an entry with `state: 'open'` for a day that legitimately has no
 * devotional — the artifact carries every day key so a lookup never misses, which
 * is what lets a caller tell "nothing for today" from "not downloaded yet".
 */
export async function readDay(dayKey: string): Promise<DayEntry | null> {
  return selectDay(await readCachedMonth(monthOfDayKey(dayKey)), dayKey)
}

/** A day's devotionals, fetching the month first if it is not cached. */
export async function ensureDay(dayKey: string): Promise<DayEntry | null> {
  return selectDay(await ensureMonth(monthOfDayKey(dayKey)), dayKey)
}

/** Drop memoized content so a freshly synced file is picked up. */
export function invalidateMemo(): void {
  monthMemo.clear()
  manifestMemo = null
}
