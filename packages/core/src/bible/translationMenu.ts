// Groups translations by language for the picker (DOM-free). Ported from
// apps/web/src/utils/bible/translationMenu.ts. `locale` is injected by the
// caller (no navigator access here).

import type { BibleTranslation } from './types'

export type BibleTranslationGroup = {
  languageCode: string
  languageLabel: string
  translations: BibleTranslation[]
}

export function buildBibleTranslationGroups(translations: BibleTranslation[], locale = 'en'){
  const byLanguage = new Map<string, BibleTranslationGroup>()

  for (const translation of translations || []){
    const code = normalizeLanguageCode(translation.language)
    const existing = byLanguage.get(code)
    if (existing) {
      existing.translations.push(translation)
      continue
    }
    byLanguage.set(code, {
      languageCode: code,
      languageLabel: resolveLanguageLabel(code, locale),
      translations: [translation],
    })
  }

  const groups = Array.from(byLanguage.values())
  for (const group of groups){
    group.translations.sort((a, b) => (
      translationOptionLabel(a).localeCompare(translationOptionLabel(b), undefined, { sensitivity: 'base' })
    ))
  }
  groups.sort((a, b) => a.languageLabel.localeCompare(b.languageLabel, undefined, { sensitivity: 'base' }))

  return groups
}

export function translationOptionLabel(translation: BibleTranslation){
  const label = String(translation?.label || translation?.id || '').trim()
  const name = String(translation?.name || '').trim()
  if (!name) return label || String(translation?.id || '').toUpperCase()
  if (!label) return name
  if (normalize(name) === normalize(label)) return name
  if (name.includes(`(${label})`)) return name
  return `${name} (${label})`
}

function normalizeLanguageCode(raw: string){
  const cleaned = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
  return cleaned || 'und'
}

// Explicit code → human-readable name map for the language-group headers.
// Consulted before Intl.DisplayNames so the picker shows real names even where
// Intl is unavailable (React Native / Hermes ships no DisplayNames data, which
// is why headers otherwise fall back to the raw uppercase code), and so
// non-standard ISO 639-3 codes like `ctd` resolve at all. Codes are normalized
// to lowercase before lookup.
const LANGUAGE_NAMES: Record<string, string> = {
  ar: 'Arabic',
  ctd: 'Tedim Chin',
  en: 'English',
  es: 'Spanish',
  fa: 'Persian',
  id: 'Indonesian',
  ko: 'Korean',
  tl: 'Tagalog',
  tr: 'Turkish',
}

function resolveLanguageLabel(code: string, locale: string){
  const explicit = LANGUAGE_NAMES[code] || LANGUAGE_NAMES[code.split('-')[0]]
  if (explicit) return explicit
  const label = languageLabelFromIntl(code, locale)
  if (label) return label
  if (code === 'und') return 'Unknown'
  return code.split('-').map((part) => part.toUpperCase()).join('-')
}

function languageLabelFromIntl(code: string, locale: string){
  try {
    if (typeof Intl === 'undefined' || typeof Intl.DisplayNames !== 'function') return null
    const displayNames = new Intl.DisplayNames([locale], { type: 'language' })
    const exact = displayNames.of(code)
    if (exact && exact.toLowerCase() !== code.toLowerCase()) return exact
    const base = code.split('-')[0]
    if (!base || base === code) return null
    const fallback = displayNames.of(base)
    if (fallback && fallback.toLowerCase() !== base.toLowerCase()) return fallback
    return null
  } catch {
    return null
  }
}

function normalize(value: string){
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}
