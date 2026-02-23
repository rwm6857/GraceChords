import { publicUrl } from '../network/publicUrl'
import { normalizeLanguageCode as normalizeSongLanguageCode, resolveInitialSongLanguage } from '../songs/songCatalog'

export type BibleTranslation = {
  id: string
  label: string
  name: string
  language: string
  dataRoot: string
}

type TranslationManifest = {
  defaultTranslation?: string
  translations?: unknown
}

const DEFAULT_BIBLE_TRANSLATION_ID = 'esv'
const MANIFEST_PATH = 'bible/translations.json'
const PREFERENCE_KEY = 'pref:bibleTranslation'

const FALLBACK_TRANSLATIONS: BibleTranslation[] = [
  {
    id: DEFAULT_BIBLE_TRANSLATION_ID,
    label: 'ESV',
    name: 'English Standard Version',
    language: 'en',
    dataRoot: 'bible/en/esv',
  },
]

let translationsPromise: Promise<{ translations: BibleTranslation[], defaultTranslationId: string }> | null = null

export function normalizeBibleTranslationId(value: unknown){
  const cleaned = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
  return cleaned || DEFAULT_BIBLE_TRANSLATION_ID
}

export function getDefaultBibleTranslationId(){
  return DEFAULT_BIBLE_TRANSLATION_ID
}

export function getFallbackBibleTranslations(){
  return [...FALLBACK_TRANSLATIONS]
}

export function readBibleTranslationPreference(){
  try {
    if (typeof window === 'undefined') return ''
    const raw = window.localStorage.getItem(PREFERENCE_KEY)
    if (!raw) return ''
    return normalizeBibleTranslationId(raw)
  } catch {
    return ''
  }
}

export function writeBibleTranslationPreference(translationId: string){
  try {
    if (typeof window === 'undefined') return
    const raw = String(translationId || '').trim()
    if (!raw) return
    window.localStorage.setItem(PREFERENCE_KEY, normalizeBibleTranslationId(raw))
  } catch {}
}

export function resolveBibleTranslationLabel(
  translationId: string,
  translations: BibleTranslation[] = FALLBACK_TRANSLATIONS
){
  const id = normalizeBibleTranslationId(translationId)
  return translations.find((item) => item.id === id)?.label || id.toUpperCase()
}

export function resolveBibleTranslationSelection(
  preferredId: unknown,
  translations: BibleTranslation[],
  defaultTranslationId: unknown
){
  const preferredRaw = String(preferredId ?? '').trim()
  if (preferredRaw) {
    const preferred = normalizeBibleTranslationId(preferredRaw)
    if (translations.some((item) => item.id === preferred)) return preferred
  }

  const defaultRaw = String(defaultTranslationId ?? '').trim()
  if (defaultRaw) {
    const fallback = normalizeBibleTranslationId(defaultRaw)
    if (translations.some((item) => item.id === fallback)) return fallback
  }

  if (translations.some((item) => item.id === DEFAULT_BIBLE_TRANSLATION_ID)) {
    return DEFAULT_BIBLE_TRANSLATION_ID
  }
  return translations[0]?.id || DEFAULT_BIBLE_TRANSLATION_ID
}

export async function listBibleTranslations(options: { force?: boolean } = {}){
  if (!translationsPromise || options.force) {
    translationsPromise = fetchTranslations()
  }
  return translationsPromise
}

async function fetchTranslations(){
  try {
    const res = await fetch(publicUrl(MANIFEST_PATH), { cache: 'no-store' })
    if (!res.ok) throw new Error(`Failed to load translations (${res.status})`)
    const manifest = await res.json() as TranslationManifest
    const translations = normalizeTranslations(manifest.translations)
    const defaultTranslationId = normalizeDefaultTranslationId(
      manifest.defaultTranslation,
      translations
    )
    return { translations, defaultTranslationId }
  } catch {
    return {
      translations: [...FALLBACK_TRANSLATIONS],
      defaultTranslationId: DEFAULT_BIBLE_TRANSLATION_ID,
    }
  }
}

function normalizeDefaultTranslationId(raw: unknown, translations: BibleTranslation[]){
  const uiLanguage = resolveInitialSongLanguage(
    translations.map((item) => normalizeSongLanguageCode(item.language, 'en')),
    'en'
  )

  if (uiLanguage === 'en' && translations.some((item) => item.id === DEFAULT_BIBLE_TRANSLATION_ID)) {
    return DEFAULT_BIBLE_TRANSLATION_ID
  }

  if (uiLanguage !== 'en') {
    const match = translations.find(
      (item) => normalizeSongLanguageCode(item.language, 'en') === uiLanguage
    )
    if (match?.id) return match.id
  }

  const requested = normalizeBibleTranslationId(raw)
  if (translations.some((item) => item.id === requested)) return requested
  if (translations.some((item) => item.id === DEFAULT_BIBLE_TRANSLATION_ID)) {
    return DEFAULT_BIBLE_TRANSLATION_ID
  }
  return translations[0]?.id || DEFAULT_BIBLE_TRANSLATION_ID
}

function normalizeTranslations(raw: unknown){
  if (!Array.isArray(raw)) return [...FALLBACK_TRANSLATIONS]
  const normalized = raw
    .map((item) => normalizeTranslation(item))
    .filter((item): item is BibleTranslation => Boolean(item))
  if (!normalized.length) return [...FALLBACK_TRANSLATIONS]
  return normalized
}

function normalizeTranslation(raw: unknown){
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const id = normalizeBibleTranslationId(record.id)
  const label = String(record.label || id.toUpperCase()).trim() || id.toUpperCase()
  const name = String(record.name || label).trim() || label
  const language = String(record.language || 'en').trim() || 'en'
  const rootInput = String(record.dataRoot || `bible/en/${id}`).trim()
  const dataRoot = rootInput.replace(/^\/+/, '')
  if (!dataRoot) return null
  return { id, label, name, language, dataRoot }
}
