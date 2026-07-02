// Translation manifest: normalization + fetch (DOM-free). Ported from
// apps/web/src/utils/bible/translations.ts, with the web-only bits removed —
// localStorage preferences and UI-locale defaulting stay in the app layer.
// The base URL and fetch implementation are injected so the same code serves
// the web proxy, direct R2, and (later) a local offline source.

import type { BibleTranslation } from './types'

type TranslationManifest = {
  version?: unknown
  defaultTranslation?: string
  translations?: unknown
}

export type FetchLike = (input: string, init?: { signal?: AbortSignal }) => Promise<{
  ok: boolean
  status: number
  json: () => Promise<unknown>
}>

export const DEFAULT_BIBLE_TRANSLATION_ID = 'esv'
export const BIBLE_MANIFEST_PATH = 'bible/translations.json'

const FALLBACK_TRANSLATIONS: BibleTranslation[] = [
  {
    id: DEFAULT_BIBLE_TRANSLATION_ID,
    label: 'ESV',
    name: 'English Standard Version',
    language: 'en',
    dataRoot: 'bible/en/esv',
  },
]

export function getFallbackBibleTranslations(){
  return [...FALLBACK_TRANSLATIONS]
}

export function getDefaultBibleTranslationId(){
  return DEFAULT_BIBLE_TRANSLATION_ID
}

export function normalizeBibleTranslationId(value: unknown){
  const cleaned = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
  return cleaned || DEFAULT_BIBLE_TRANSLATION_ID
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

export type TranslationsResult = {
  translations: BibleTranslation[]
  defaultTranslationId: string
  /**
   * Manifest-wide version string, when present. Captured at download time so the
   * offline layer can detect a stale local copy. Empty when the manifest omits
   * it or could not be loaded.
   */
  version: string
}

/**
 * Load and normalize the translation manifest from `<baseUrl>/bible/translations.json`.
 * Falls back to the built-in ESV entry on any failure so the Reader always has
 * at least one usable translation.
 */
export async function fetchBibleTranslations(
  baseUrl: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike
): Promise<TranslationsResult> {
  try {
    const url = joinUrl(baseUrl, BIBLE_MANIFEST_PATH)
    const res = await fetchImpl(url)
    if (!res.ok) throw new Error(`Failed to load translations (${res.status})`)
    const manifest = await res.json() as TranslationManifest
    const translations = normalizeTranslations(manifest.translations)
    const defaultTranslationId = normalizeBibleTranslationId(
      resolveManifestDefault(manifest.defaultTranslation, translations)
    )
    const version = manifest.version == null ? '' : String(manifest.version)
    return { translations, defaultTranslationId, version }
  } catch {
    return {
      translations: [...FALLBACK_TRANSLATIONS],
      defaultTranslationId: DEFAULT_BIBLE_TRANSLATION_ID,
      version: '',
    }
  }
}

function resolveManifestDefault(raw: unknown, translations: BibleTranslation[]){
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

/** Join a base URL and a path, collapsing the slash between them. */
export function joinUrl(baseUrl: string, path: string){
  const base = String(baseUrl || '').replace(/\/+$/, '')
  const rel = String(path || '').replace(/^\/+/, '')
  return `${base}/${rel}`
}
