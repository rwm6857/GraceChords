// Cache path layout for devotional content.
//
// Mirrors the convention src/lib/downloads/paths.ts established for Bible
// chapters: relative paths only, resolved against the app DOCUMENT directory by
// the store, with a sibling temp root for staging so writes can be atomic.
//
// There is no bundled baseline — devotional content is fetched and cached, so it
// can be changed remotely without shipping a binary. The cache is therefore the
// ONLY local source, which is why the manifest is cached too: without it the
// device would not know a month's remote path while offline.

/** Root for cached devotional content, under the document directory. */
export const DEVOTIONALS_ROOT = 'devotionals'

/** Root for in-progress writes, staged before the atomic move into place. */
export const DEVOTIONALS_TMP_ROOT = '.devotionals-tmp'

/** Cached manifest, e.g. `devotionals/manifest.json`. */
export function manifestRelPath(): string {
  return `${DEVOTIONALS_ROOT}/manifest.json`
}

/** Cached month file, e.g. `devotionals/month/01.json`. */
export function monthRelPath(monthKey: string): string {
  return `${DEVOTIONALS_ROOT}/month/${monthKey}.json`
}

/** Staging path for a file being written, e.g. `.devotionals-tmp/01.json`. */
export function tmpRelPath(name: string): string {
  return `${DEVOTIONALS_TMP_ROOT}/${name}`
}

/**
 * Remote URL for a month, from its manifest entry. The entry's `file` already
 * carries the content version (`{contentVersion}/month/01.json`), which is what
 * makes remote month objects immutable and cache invalidation unnecessary.
 */
export function monthUrl(base: string, file: string): string {
  return `${base}/${DEVOTIONALS_ROOT}/${file}`
}

/** Remote URL for the manifest — the only mutable object. */
export function manifestUrl(base: string): string {
  return `${base}/${DEVOTIONALS_ROOT}/manifest.json`
}
