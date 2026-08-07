// Cache path layout for synced devotional months.
//
// Mirrors the convention src/lib/downloads/paths.ts established for Bible
// chapters: relative paths only, resolved against the app DOCUMENT directory by
// the store, with a sibling temp root for staging so a write can be made atomic.
//
// The R2 path carries the content version (`{contentVersion}/month/01.json`) so
// remote objects are immutable. The local cache deliberately does NOT: the device
// keeps exactly one copy per month and replaces it in place, and the manifest
// hash in sync state is what records which version that copy is.

/** Root for cached devotional months, under the document directory. */
export const DEVOTIONALS_ROOT = 'devotionals'

/** Root for in-progress writes, staged before the atomic move. */
export const DEVOTIONALS_TMP_ROOT = '.devotionals-tmp'

/** Cached month file, e.g. `devotionals/month/01.json`. */
export function monthRelPath(monthKey: string): string {
  return `${DEVOTIONALS_ROOT}/month/${monthKey}.json`
}

/** Staging path for a month being written, e.g. `.devotionals-tmp/01.json`. */
export function tmpMonthRelPath(monthKey: string): string {
  return `${DEVOTIONALS_TMP_ROOT}/${monthKey}.json`
}
