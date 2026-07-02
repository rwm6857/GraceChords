import {
  fetchBibleChapter,
  fetchBibleTranslations,
  getPlanForDate,
  expandReadings,
  mmddFromDate,
  resolveBibleTranslationSelection,
  type BibleTranslation,
  type ChapterData,
  type Passage,
  type TranslationsResult,
} from '@gracechords/core'
// Import the offline read helpers from their specific submodules (not the
// downloads barrel, which re-exports service.ts → which imports THIS file) to
// avoid an import cycle.
import { readLocalChapter } from './downloads/resolver'
import { getDownloadsSnapshot } from './downloads/manifest'

// Source seam for Daily Word passage content. Today it reads from the
// Cloudflare R2 bucket that also serves the web app's Bible JSON; the accessor
// is shaped so a LOCAL OFFLINE-DOWNLOAD source can slot in behind it later
// without any caller changes (see the stubbed branch in fetchChapter).
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

// ── Translation manifest (memoized for the app's lifetime) ──────────────────
let translationsPromise: Promise<TranslationsResult> | null = null

/** Load and normalize the translation manifest from the active source (once). */
export function getTranslations(): Promise<TranslationsResult> {
  if (!translationsPromise) {
    translationsPromise = fetchBibleTranslations(r2Base()).then(withDownloadedTranslations)
  }
  return translationsPromise
}

/**
 * Union any downloaded translations into the manifest result so a downloaded
 * translation still lists in the picker when the network manifest is
 * unreachable (offline → fetchBibleTranslations falls back to ESV-only).
 */
function withDownloadedTranslations(result: TranslationsResult): TranslationsResult {
  const records = Object.values(getDownloadsSnapshot().records)
  if (!records.length) return result
  const present = new Set(result.translations.map((t) => t.id))
  const extra: BibleTranslation[] = records
    .filter((r) => !present.has(r.id))
    .map((r) => ({ id: r.id, label: r.label, name: r.name, language: r.language, dataRoot: r.dataRoot }))
  if (!extra.length) return result
  return { ...result, translations: [...result.translations, ...extra] }
}

// ── Chapter cache ───────────────────────────────────────────────────────────
// Chapters are cached in memory keyed by translation+book+chapter. Bible text
// is immutable, so within a day the reader never re-fetches. The cache is
// scoped to a calendar day: the first open on a new day clears it (see
// prefetchToday), so "today's" reading is naturally repulled.
const chapterCache = new Map<string, ChapterData>()
const inFlight = new Map<string, Promise<ChapterData>>()
let cacheDay = ''

function chapterKey(translationId: string, bookNumber: number, chapter: number) {
  return `${translationId}:${bookNumber}:${chapter}`
}

/** Synchronous cache read — lets the reader render prefetched chapters with no spinner. */
export function getCachedPassage(
  translationId: string,
  bookNumber: number,
  chapter: number
): ChapterData | undefined {
  return chapterCache.get(chapterKey(translationId, bookNumber, chapter))
}

export type PassageQuery = {
  passage: Passage
  translation: BibleTranslation
}

export type ResolvePassageDeps = {
  /** Return a downloaded local copy, or null to fall through to the network. */
  readLocal: (
    translationId: string,
    dataRoot: string,
    bookNumber: number,
    chapter: number
  ) => Promise<ChapterData | null>
  fetchRemote: (query: PassageQuery) => Promise<ChapterData>
}

/**
 * Offline-first resolution for one passage's chapter: local downloaded copy when
 * present, else the network source. Pure over injected deps so the branch tests
 * headless (and proves the remote fetch is skipped on a local hit).
 */
export async function resolvePassageChapter(
  { passage, translation }: PassageQuery,
  deps: ResolvePassageDeps
): Promise<ChapterData> {
  const local = await deps.readLocal(
    translation.id,
    translation.dataRoot,
    passage.bookNumber,
    passage.chapter
  )
  if (local) return local
  return deps.fetchRemote({ passage, translation })
}

const fetchRemoteChapter = ({ passage, translation }: PassageQuery): Promise<ChapterData> =>
  fetchBibleChapter({
    baseUrl: r2Base(),
    dataRoot: translation.dataRoot,
    bookNumber: passage.bookNumber,
    chapter: passage.chapter,
  })

/**
 * Fetch the chapter backing a passage. Cache-first, with in-flight de-duping so
 * a prefetch and the reader can't double-fetch the same chapter. This is the
 * single seam every reader path goes through: it resolves a downloaded local
 * copy first, then falls back to the R2 network source.
 */
export function getPassage({ passage, translation }: PassageQuery): Promise<ChapterData> {
  const key = chapterKey(translation.id, passage.bookNumber, passage.chapter)
  const cached = chapterCache.get(key)
  if (cached) return Promise.resolve(cached)
  const existing = inFlight.get(key)
  if (existing) return existing

  const request = resolvePassageChapter(
    { passage, translation },
    { readLocal: readLocalChapter, fetchRemote: fetchRemoteChapter }
  )
    .then((data) => {
      chapterCache.set(key, data)
      inFlight.delete(key)
      return data
    })
    .catch((err) => {
      inFlight.delete(key)
      throw err
    })
  inFlight.set(key, request)
  return request
}

/**
 * Warm the cache with today's passages so the reader opens instantly even if it
 * hasn't been visited. Called once on app open. On the first open of a new
 * calendar day it clears the previous day's cache and repulls. Best-effort:
 * failures are swallowed and the reader falls back to on-demand fetching.
 */
export async function prefetchToday(): Promise<void> {
  const today = new Date()
  const day = mmddFromDate(today)
  if (day !== cacheDay) {
    cacheDay = day
    chapterCache.clear()
    inFlight.clear()
  }
  try {
    const { translations, defaultTranslationId } = await getTranslations()
    const id = resolveBibleTranslationSelection('', translations, defaultTranslationId)
    const translation = translations.find((x) => x.id === id) || translations[0]
    if (!translation) return
    const passages = expandReadings(getPlanForDate(today).readings)
    await Promise.all(passages.map((passage) => getPassage({ passage, translation }).catch(() => {})))
  } catch {
    // best-effort warm-up
  }
}
