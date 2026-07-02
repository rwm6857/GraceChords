import { allChapters, joinUrl, type BibleTranslation, type ChapterRef } from '@gracechords/core'
import {
  DownloadCancelledError,
  type AbortToken,
  type BibleDownload,
  type BlobStore,
  type DownloadProgress,
} from './types'
import { chapterRelPath, tmpChapterRelPath, tmpDirRel, translationDirRel } from './paths'

// Whole-translation downloader. Pure over injected deps (fetch, blob store, clock)
// so it tests headless. Guarantees:
//  - ATOMICITY: chapters download into a temp dir; only a fully-successful run is
//    moved into place and returned as a record. Any failure/cancel deletes the
//    temp dir and leaves NO record — the resolver then falls back to the network.
//  - PROGRESS: onProgress fires after each chapter (done monotonic up to total).
//  - CONCURRENCY: a fixed worker pool caps in-flight requests (Bibles are ~1189
//    small files).
//  - CANCEL: a cooperative token checked before each chapter.
//  - 404 TOLERANCE: a translation may omit a chapter; those are skipped (counted
//    toward progress but not written). Zero chapters written is treated as failure.

export type FetchLike = (
  input: string,
  init?: { signal?: unknown }
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>

export type DownloadDeps = {
  blobStore: BlobStore
  fetchImpl: FetchLike
  onProgress?: (p: DownloadProgress) => void
  signal?: AbortToken
  concurrency?: number
  /** Injectable clock (tests). Defaults to the wall clock. */
  nowIso?: () => string
  /** Injectable chapter list (tests). Defaults to the full canonical Bible. */
  chapters?: ChapterRef[]
}

const DEFAULT_CONCURRENCY = 8

export async function downloadBibleTranslation(
  translation: BibleTranslation,
  version: string,
  baseUrl: string,
  deps: DownloadDeps
): Promise<BibleDownload> {
  const { blobStore, fetchImpl } = deps
  const chapters = deps.chapters ?? allChapters()
  const total = chapters.length
  const id = translation.id
  const tmp = tmpDirRel(id)
  const concurrency = Math.max(1, Math.min(deps.concurrency ?? DEFAULT_CONCURRENCY, total || 1))

  // Start from a clean staging dir (a prior aborted attempt may have left one).
  await blobStore.deleteDir(tmp)

  let done = 0
  let written = 0
  let cursor = 0

  const checkCancel = () => {
    if (deps.signal?.aborted) throw new DownloadCancelledError()
  }

  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++
      if (i >= total) return
      checkCancel()
      const { bookNumber, chapter } = chapters[i]
      const url = joinUrl(baseUrl, chapterRelPath(translation.dataRoot, bookNumber, chapter))
      const res = await fetchImpl(url)
      if (res.status !== 404) {
        if (!res.ok) throw new Error(`Failed to download chapter (${res.status})`)
        const text = await res.text()
        await blobStore.writeText(tmpChapterRelPath(id, bookNumber, chapter), text)
        written++
      }
      done++
      deps.onProgress?.({ done, total })
    }
  }

  try {
    await Promise.all(Array.from({ length: concurrency }, () => worker()))
    checkCancel()
    if (written === 0) throw new Error('No chapters were downloaded')

    // Atomic finalize: move the fully-staged tree into place, then measure it.
    await blobStore.moveDir(tmp, translationDirRel(translation.dataRoot))
    const sizeBytes = await blobStore.dirSizeBytes(translationDirRel(translation.dataRoot))
    const nowIso = deps.nowIso ?? (() => new Date().toISOString())

    return {
      id,
      type: 'bible',
      dataRoot: translation.dataRoot,
      label: translation.label,
      name: translation.name,
      language: translation.language,
      version,
      sizeBytes,
      chapterCount: written,
      downloadedAt: nowIso(),
      status: 'complete',
    }
  } catch (err) {
    // Clean up partials on any failure/cancel — never leave a half-written tree.
    await blobStore.deleteDir(tmp).catch(() => {})
    throw err
  }
}
