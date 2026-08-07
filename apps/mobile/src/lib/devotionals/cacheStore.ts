import { Directory, File, Paths } from 'expo-file-system'

// Filesystem access for cached devotional months, isolated in its own module so
// `expo-file-system` is only pulled in when a cached read is actually attempted —
// keeping it off the synchronous bundled read path and out of unit tests, the
// same reason src/lib/downloads/resolver.ts loads its blob store lazily.
//
// Rooted at the DOCUMENT directory, not the cache directory, so synced content
// survives relaunch — matching downloads/expoBlobStore.ts.

function seg(relPath: string): string[] {
  return String(relPath || '')
    .split('/')
    .filter((p) => p && p !== '.')
}

const fileAt = (relPath: string) => new File(Paths.document, ...seg(relPath))
const dirAt = (relPath: string) => new Directory(Paths.document, ...seg(relPath))

function ensureParent(relPath: string): void {
  const parts = seg(relPath)
  const dir = dirAt(parts.slice(0, -1).join('/'))
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true })
}

/** Cached month text, or null when absent. Never throws. */
export async function readCachedMonthText(relPath: string): Promise<string | null> {
  try {
    const file = fileAt(relPath)
    if (!file.exists) return null
    return await file.text()
  } catch {
    return null
  }
}

/**
 * Write a month atomically: stage to a temp path, then move into place.
 *
 * A partially written cache file must never be readable — a truncated JSON file
 * would fail validation and silently drop a month back to the bundled baseline,
 * which is recoverable but wrong. The move is the commit point.
 */
export async function writeCachedMonthAtomic(
  tmpRelPath: string,
  finalRelPath: string,
  text: string
): Promise<boolean> {
  try {
    ensureParent(tmpRelPath)
    const tmp = fileAt(tmpRelPath)
    tmp.create({ intermediates: true, overwrite: true })
    tmp.write(text)

    ensureParent(finalRelPath)
    const final = fileAt(finalRelPath)
    if (final.exists) final.delete()
    tmp.move(final)
    return true
  } catch {
    try {
      const tmp = fileAt(tmpRelPath)
      if (tmp.exists) tmp.delete()
    } catch { /* nothing further to do */ }
    return false
  }
}
