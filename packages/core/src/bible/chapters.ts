// Chapter fetch (DOM-free). Ported from apps/web/src/utils/bible/chapters.ts,
// but base-URL injected instead of using the web `publicUrl` helper. R2 keys
// chapter files by book NUMBER: `<dataRoot>/<bookNumber>/<chapter>.json`
// (e.g. bible/en/esv/1/1.json for Genesis 1).

import type { ChapterData } from './types'
import { joinUrl, type FetchLike } from './translations'

export type ChapterQuery = {
  /** Base URL of the source, e.g. https://assets.gracechords.com */
  baseUrl: string
  /** Translation dataRoot from the manifest, e.g. `bible/en/esv`. */
  dataRoot: string
  /** Canonical book number, 1–66. */
  bookNumber: number
  chapter: number
  signal?: AbortSignal
  fetchImpl?: FetchLike
}

export async function fetchBibleChapter({
  baseUrl,
  dataRoot,
  bookNumber,
  chapter,
  signal,
  fetchImpl = fetch as unknown as FetchLike,
}: ChapterQuery): Promise<ChapterData> {
  const root = String(dataRoot || '').replace(/^\/+|\/+$/g, '')
  const url = joinUrl(baseUrl, `${root}/${bookNumber}/${chapter}.json`)
  const res = await fetchImpl(url, { signal })
  if (!res.ok) throw new Error(`Failed to load passage (${res.status})`)
  const payload = await res.json()
  return normalizeChapterPayload(payload, { book: String(bookNumber), chapter })
}

/**
 * Normalize a raw chapter JSON payload into `ChapterData`. Exported so a local
 * (offline) chapter read produces byte-identical output to a network fetch.
 */
export function normalizeChapterPayload(
  payload: unknown,
  fallback: { book: string, chapter: number }
): ChapterData {
  const record = payload && typeof payload === 'object'
    ? payload as Record<string, unknown>
    : {}
  const versesRecord = record.verses && typeof record.verses === 'object'
    ? record.verses as Record<string, unknown>
    : {}
  const verses = Object.fromEntries(
    Object.entries(versesRecord).map(([key, value]) => [String(key), String(value || '')])
  )
  return {
    book: String(record.book || fallback.book),
    chapter: normalizeChapter(record.chapter, fallback.chapter),
    verses,
  }
}

function normalizeChapter(raw: unknown, fallback: number){
  const parsed = Number(raw)
  return Number.isNaN(parsed) ? fallback : parsed
}
