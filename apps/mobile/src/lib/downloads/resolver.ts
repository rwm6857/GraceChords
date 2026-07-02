import { normalizeChapterPayload, type ChapterData } from '@gracechords/core'
import type { BlobStore } from './types'
import { chapterRelPath } from './paths'
import { isDownloaded } from './manifest'

// Offline-first read-path resolver. Pure over injected deps so it tests headless.
// The production default wiring (the expo-file-system blob store) is loaded
// LAZILY — a static import of './expoBlobStore' would pull expo-file-system into
// the module graph and break the node test harness. When callers inject deps
// (tests, and bibleSource passes them at runtime), the lazy path never runs.

export type ResolverDeps = {
  isDownloaded: (translationId: string) => boolean
  blobStore: BlobStore
}

let defaultsPromise: Promise<ResolverDeps> | null = null
function getDefaultDeps(): Promise<ResolverDeps> {
  if (!defaultsPromise) {
    defaultsPromise = import('./expoBlobStore').then(({ expoBlobStore }) => ({
      isDownloaded,
      blobStore: expoBlobStore,
    }))
  }
  return defaultsPromise
}

/**
 * Return the locally-downloaded chapter for a passage, or `null` when the
 * translation isn't downloaded or the file can't be read (caller then falls
 * back to the network). Never throws — a read failure resolves to `null`.
 */
export async function readLocalChapter(
  translationId: string,
  dataRoot: string,
  bookNumber: number,
  chapter: number,
  deps?: ResolverDeps
): Promise<ChapterData | null> {
  const d = deps ?? (await getDefaultDeps())
  if (!d.isDownloaded(translationId)) return null
  const rel = chapterRelPath(dataRoot, bookNumber, chapter)
  try {
    if (!(await d.blobStore.exists(rel))) return null
    const payload = JSON.parse(await d.blobStore.readText(rel))
    return normalizeChapterPayload(payload, { book: String(bookNumber), chapter })
  } catch {
    return null
  }
}
