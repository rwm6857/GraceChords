import {
  fetchBibleChapter,
  fetchBibleTranslations,
  getPlanForDate,
  expandReadings,
  type BibleTranslation,
  type ChapterData,
  type Passage,
  type TranslationsResult,
} from '@gracechords/core'

// Source seam for Daily Word passage content. Today it reads from the
// Cloudflare R2 bucket that also serves the web app's Bible JSON; the accessor
// is shaped so a LOCAL OFFLINE-DOWNLOAD source can slot in behind it later
// without any caller changes (see the stubbed branch in getPassage).
//
// R2 layout (confirmed against apps/web + apps/web/scripts/bible-xml-to-json.mjs):
//   <base>/bible/translations.json                       — manifest
//   <base>/<dataRoot>/<bookNumber>/<chapter>.json         — one chapter, keyed
//                                                           by book NUMBER (1–66)

const DEFAULT_R2_PUBLIC_URL = 'https://assets.gracechords.com'

/** Base URL for R2 Bible assets. Overridable via EXPO_PUBLIC_R2_PUBLIC_URL. */
export function r2Base(): string {
  const raw = process.env.EXPO_PUBLIC_R2_PUBLIC_URL || DEFAULT_R2_PUBLIC_URL
  return raw.replace(/\/+$/, '')
}

// Re-export the plan/reading helpers so screens depend on this seam, not core
// directly — keeps the "where does a day's reading come from" question in one
// place alongside the passage fetch.
export { getPlanForDate, expandReadings }
export type { BibleTranslation, ChapterData, Passage }

/** Load and normalize the translation manifest from the active source. */
export function getTranslations(): Promise<TranslationsResult> {
  return fetchBibleTranslations(r2Base())
}

export type PassageQuery = {
  passage: Passage
  translation: BibleTranslation
  signal?: AbortSignal
}

/**
 * Fetch the chapter backing a passage. The single seam every reader path goes
 * through: swap the body for a local-file read to add offline support later.
 */
export function getPassage({ passage, translation, signal }: PassageQuery): Promise<ChapterData> {
  // offline: a downloaded-translation source will branch here first, e.g.
  //   if (await hasLocalCopy(translation.id, passage.bookNumber, passage.chapter))
  //     return readLocalChapter(...)
  // Download + file management ships in a later stage; for now always fetch R2.
  return fetchBibleChapter({
    baseUrl: r2Base(),
    dataRoot: translation.dataRoot,
    bookNumber: passage.bookNumber,
    chapter: passage.chapter,
    signal,
  })
}
