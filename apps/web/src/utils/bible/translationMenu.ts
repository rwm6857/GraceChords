import type { BibleTranslation } from './translations'

export type BibleTranslationGroup = {
  languageCode: string
  languageLabel: string
  translations: BibleTranslation[]
}

export function buildBibleTranslationGroups(translations: BibleTranslation[], locale?: string){
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

function resolveLanguageLabel(code: string, locale?: string){
  const sourceLocale = locale || inferLocale()
  const label = languageLabelFromIntl(code, sourceLocale)
  if (label) return label
  if (code === 'und') return 'Unknown'
  return code.split('-').map((part) => part.toUpperCase()).join('-')
}

function inferLocale(){
  try {
    if (typeof navigator !== 'undefined' && navigator.language) return navigator.language
  } catch {}
  return 'en'
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
