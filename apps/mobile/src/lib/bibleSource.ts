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
import {
  BACKGROUND_MS,
  FOREGROUND_MS,
  withDeadline,
  withRequestBudget,
  type FetchFn,
} from './requestBudget'

// Source seam for Daily Word passage content. Today it reads from the
// Cloudflare R2 bucket that also serves the web app's Bible JSON; the accessor
// is shaped so a LOCAL OFFLINE-DOWNLOAD source can slot in behind it later
// without any caller changes (see the stubbed branch in fetchChapter).
//
// R2 layout (confirmed against apps/web + apps/web/scripts/bible-xml-to-json.mjs):
//   <base>/bible/translations.json                       — manifest
//   <base>/<dataRoot>/<bookNumber>/<chapter>.json         — one chapter, keyed
//                                                           by book NUMBER (1–66)

// The base URL now lives in ./r2 so the devotional layer can use the same one
// without importing this module (which pulls the core barrel, and with it
// Supabase). Imported for local use and re-exported so existing callers of
// `bibleSource.r2Base` are unaffected.
import { r2Base } from './r2'
export { r2Base }

// Re-export the plan/reading helpers so screens depend on this seam, not core
// directly — keeps the "where does a day's reading come from" question in one
// place alongside the passage fetch.
export { getPlanForDate, expandReadings }
export type { BibleTranslation, ChapterData, Passage }

// A chapter read the reader is waiting on. This budget is used even when the
// launch prefetch started the request, because getPassage de-dupes in flight —
// a reader that joins a prefetch's promise must not inherit a shorter deadline.
const chapterFetch = withRequestBudget(fetch, () => FOREGROUND_MS)

// The manifest is only ever needed before a chapter, never on its own, and it
// has a built-in ESV fallback — so it yields sockets rather than holding them.
const manifestFetch = withRequestBudget(fetch, () => BACKGROUND_MS)

// ── Translation manifest (memoized for the app's lifetime) ──────────────────
let translationsPromise: Promise<TranslationsResult> | null = null

/**
 * Load and normalize the translation manifest from the active source (once).
 *
 * A SUCCESS is memoized for the app's lifetime (the manifest is effectively
 * immutable); a FAILURE is not. fetchBibleTranslations never rejects — it
 * swallows everything and returns the built-in ESV-only fallback — so without
 * this the first bad network call would pin the translation picker to ESV until
 * the next launch, and the reader's Retry button only re-fetches the chapter,
 * never the manifest. Bounding the request made that outcome arrive sooner,
 * which is what surfaced it. `loaded` is set by the probe below because the
 * fallback is otherwise indistinguishable from a real one-translation manifest.
 */
export function getTranslations(): Promise<TranslationsResult> {
  if (!translationsPromise) {
    let loaded = true
    const probe = (async (input, init) => {
      try {
        const res = await manifestFetch(input, init)
        if (!res.ok) loaded = false
        return res
      } catch (err) {
        loaded = false
        throw err
      }
    }) as FetchFn
    const attempt = fetchBibleTranslations(r2Base(), probe)
      .then(withDownloadedTranslations)
      .then((result) => {
        if (!loaded && translationsPromise === attempt) translationsPromise = null
        return result
      })
    translationsPromise = attempt
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
    // No `signal` here on purpose: this request is shared through the in-flight
    // map in getPassage, so a caller-owned AbortController would cancel a fetch
    // another subscriber is still waiting on. The deadline lives inside
    // chapterFetch instead, where it belongs to the request rather than to any
    // one caller. Callers drop results with a cooperative `alive` flag.
    fetchImpl: chapterFetch,
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
    // Stop WAITING at the background budget, but do not cancel: the underlying
    // chapter requests are shared with the reader through getPassage's in-flight
    // map, so they keep their own (longer) budget and still warm the cache if
    // they land. This only bounds how long the launch-time warm-up stays
    // pending — it is already fire-and-forget from app/_layout.tsx and never
    // gated the splash.
    await withDeadline(
      Promise.all(
        passages.map((passage) => getPassage({ passage, translation }).catch(() => {})),
      ).then(() => undefined),
      BACKGROUND_MS,
      undefined,
    )
  } catch {
    // best-effort warm-up
  }
}
