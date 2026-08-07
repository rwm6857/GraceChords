import { Directory, File, Paths } from 'expo-file-system'

// Filesystem access for cached devotional content, isolated in its own module so
// `expo-file-system` is only pulled in when the cache is actually touched — the
// same reason src/lib/downloads/resolver.ts loads its blob store lazily.
//
// Rooted at the DOCUMENT directory, not the cache directory, so synced content
// survives relaunch and is not evicted by the OS under storage pressure —
// matching downloads/expoBlobStore.ts. With no bundled baseline, an eviction
// here would empty the feature until the next sync.

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

/** Cached text, or null when absent or unreadable. Never throws. */
export async function readCachedText(relPath: string): Promise<string | null> {
  try {
    const file = fileAt(relPath)
    if (!file.exists) return null
    return await file.text()
  } catch {
    return null
  }
}

/**
 * Write atomically: stage to a temp path, then move into place.
 *
 * A partially written file must never be readable. Without a bundled baseline a
 * truncated month is not merely stale — it is the only local copy, so the commit
 * has to be the rename, which the filesystem gives us for free.
 */
export async function writeCachedTextAtomic(
  tmpPath: string,
  finalPath: string,
  text: string
): Promise<boolean> {
  try {
    ensureParent(tmpPath)
    const tmp = fileAt(tmpPath)
    tmp.create({ intermediates: true, overwrite: true })
    tmp.write(text)

    ensureParent(finalPath)
    const final = fileAt(finalPath)
    if (final.exists) final.delete()
    tmp.move(final)
    return true
  } catch {
    try {
      const tmp = fileAt(tmpPath)
      if (tmp.exists) tmp.delete()
    } catch { /* nothing further to do */ }
    return false
  }
}
