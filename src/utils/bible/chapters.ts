import { publicUrl } from '../network/publicUrl'
import { getDefaultBibleTranslationId, listBibleTranslations, normalizeBibleTranslationId } from './translations'

export type ChapterData = {
  book: string
  chapter: number
  verses: Record<string, string>
}

type ChapterQuery = {
  translationId?: string
  book: string
  chapter: number
  signal?: AbortSignal
}

export async function fetchBibleChapter({ translationId, book, chapter, signal }: ChapterQuery){
  const resolved = await resolveTranslation(translationId)
  const root = resolved.dataRoot.replace(/^\/+/, '')
  const url = publicUrl(`${root}/${encodeURIComponent(book)}/${chapter}.json`)
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Failed to load passage (${res.status})`)
  const payload = await res.json()
  return normalizeChapterPayload(payload, { book, chapter })
}

async function resolveTranslation(translationId?: string){
  const requestedId = normalizeBibleTranslationId(translationId || getDefaultBibleTranslationId())
  const { translations, defaultTranslationId } = await listBibleTranslations()
  return (
    translations.find((item) => item.id === requestedId)
    || translations.find((item) => item.id === defaultTranslationId)
    || translations[0]
    || {
      id: requestedId,
      label: requestedId.toUpperCase(),
      name: requestedId.toUpperCase(),
      language: 'en',
      dataRoot: `bibles/${requestedId}`,
    }
  )
}

function normalizeChapterPayload(
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
