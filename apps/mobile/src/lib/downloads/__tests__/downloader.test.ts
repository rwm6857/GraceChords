import { describe, expect, it } from 'vitest'
import type { ChapterRef } from '@gracechords/core'
import { downloadBibleTranslation, type FetchLike } from '../downloader'
import { DownloadCancelledError } from '../types'
import { createMemoryBlobStore } from '../memoryBlobStore'
import { chapterRelPath, tmpDirRel, translationDirRel } from '../paths'
import { chapterJson, okFetch, TEST_TRANSLATION } from './helpers'

const BASE = 'https://assets.example.com'
const CHAPTERS: ChapterRef[] = [
  { bookNumber: 1, chapter: 1 },
  { bookNumber: 1, chapter: 2 },
  { bookNumber: 1, chapter: 3 },
]
const FIXED_NOW = '2026-07-02T00:00:00.000Z'

function okChapterFetch(): FetchLike {
  return async (url) => {
    const m = url.match(/\/(\d+)\/(\d+)\.json$/)
    const book = m ? Number(m[1]) : 1
    const chap = m ? Number(m[2]) : 1
    return { ok: true, status: 200, text: async () => chapterJson(book, chap) }
  }
}

describe('downloadBibleTranslation', () => {
  it('downloads every chapter, finalizes atomically, and returns a complete record', async () => {
    const blobStore = createMemoryBlobStore()
    const progress: number[] = []
    const rec = await downloadBibleTranslation(TEST_TRANSLATION, 'v1', BASE, {
      blobStore,
      fetchImpl: okChapterFetch(),
      chapters: CHAPTERS,
      onProgress: (p) => progress.push(p.done),
      nowIso: () => FIXED_NOW,
    })

    expect(rec).toMatchObject({
      id: 'esv',
      type: 'bible',
      version: 'v1',
      chapterCount: 3,
      status: 'complete',
      downloadedAt: FIXED_NOW,
    })
    expect(rec.sizeBytes).toBeGreaterThan(0)

    // Files live at the final dataRoot; the temp staging dir is gone.
    expect(await blobStore.exists(chapterRelPath(TEST_TRANSLATION.dataRoot, 1, 1))).toBe(true)
    expect(await blobStore.exists(chapterRelPath(TEST_TRANSLATION.dataRoot, 1, 3))).toBe(true)
    expect(await blobStore.exists(tmpDirRel('esv'))).toBe(false)

    // Progress is monotonic and reaches the total.
    expect(progress[progress.length - 1]).toBe(3)
    expect(progress.every((v, i) => i === 0 || v > progress[i - 1])).toBe(true)
  })

  it('ATOMICITY: a mid-download failure leaves no partial blob and no final tree', async () => {
    const blobStore = createMemoryBlobStore()
    const failOnSecond: FetchLike = async (url) => {
      if (url.endsWith('/2.json')) throw new Error('network dropped')
      return { ok: true, status: 200, text: async () => chapterJson(1, 1) }
    }
    await expect(
      downloadBibleTranslation(TEST_TRANSLATION, 'v1', BASE, {
        blobStore,
        fetchImpl: failOnSecond,
        chapters: CHAPTERS,
        concurrency: 1, // deterministic: ch1 writes, ch2 fails, ch3 never starts
      })
    ).rejects.toThrow()

    // Nothing survives — temp cleaned AND the final tree was never created.
    expect(await blobStore.exists(translationDirRel(TEST_TRANSLATION.dataRoot))).toBe(false)
    expect(await blobStore.exists(tmpDirRel('esv'))).toBe(false)
    expect(blobStore.keys().length).toBe(0)
  })

  it('caps concurrency at the configured limit', async () => {
    let active = 0
    let max = 0
    const trackingFetch: FetchLike = async () => {
      active++
      max = Math.max(max, active)
      await Promise.resolve()
      await Promise.resolve()
      active--
      return { ok: true, status: 200, text: async () => chapterJson(1, 1) }
    }
    const many: ChapterRef[] = Array.from({ length: 20 }, (_, i) => ({ bookNumber: 1, chapter: i + 1 }))
    await downloadBibleTranslation(TEST_TRANSLATION, 'v1', BASE, {
      blobStore: createMemoryBlobStore(),
      fetchImpl: trackingFetch,
      chapters: many,
      concurrency: 4,
    })
    expect(max).toBe(4)
  })

  it('tolerates missing chapters (404) but counts only what was written', async () => {
    const blobStore = createMemoryBlobStore()
    const with404: FetchLike = async (url) =>
      url.endsWith('/2.json')
        ? { ok: false, status: 404, text: async () => '' }
        : { ok: true, status: 200, text: async () => chapterJson(1, 1) }
    const rec = await downloadBibleTranslation(TEST_TRANSLATION, 'v1', BASE, {
      blobStore,
      fetchImpl: with404,
      chapters: CHAPTERS,
    })
    expect(rec.chapterCount).toBe(2)
    expect(await blobStore.exists(chapterRelPath(TEST_TRANSLATION.dataRoot, 1, 2))).toBe(false)
    expect(await blobStore.exists(chapterRelPath(TEST_TRANSLATION.dataRoot, 1, 1))).toBe(true)
  })

  it('fails when no chapters could be downloaded', async () => {
    const all404: FetchLike = async () => ({ ok: false, status: 404, text: async () => '' })
    await expect(
      downloadBibleTranslation(TEST_TRANSLATION, 'v1', BASE, {
        blobStore: createMemoryBlobStore(),
        fetchImpl: all404,
        chapters: CHAPTERS,
      })
    ).rejects.toThrow()
  })

  it('throws on a non-404 HTTP error', async () => {
    const err500: FetchLike = async () => ({ ok: false, status: 500, text: async () => '' })
    await expect(
      downloadBibleTranslation(TEST_TRANSLATION, 'v1', BASE, {
        blobStore: createMemoryBlobStore(),
        fetchImpl: err500,
        chapters: CHAPTERS,
        concurrency: 1,
      })
    ).rejects.toThrow()
  })

  it('cancels cleanly, leaving nothing behind', async () => {
    const blobStore = createMemoryBlobStore()
    await expect(
      downloadBibleTranslation(TEST_TRANSLATION, 'v1', BASE, {
        blobStore,
        fetchImpl: okFetch(),
        chapters: CHAPTERS,
        signal: { aborted: true },
      })
    ).rejects.toBeInstanceOf(DownloadCancelledError)
    expect(blobStore.keys().length).toBe(0)
  })
})
