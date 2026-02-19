import { compareSongsByTitle } from './sort'

export const SONG_LANGUAGE_STORAGE_KEY = 'pref:songLanguage'
export const DEFAULT_SONG_LANGUAGE = 'en'

const LANGUAGE_ALIASES = {
  en: 'en',
  eng: 'en',
  tr: 'tr',
  tur: 'tr',
  ar: 'ar',
  ara: 'ar',
  es: 'es',
  spa: 'es',
  sp: 'es',
}

const LANGUAGE_LABELS = {
  en: 'EN',
  tr: 'TR',
  ar: 'AR',
  es: 'SP',
}

function toLangKey(value = ''){
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return ''
  if (LANGUAGE_ALIASES[raw]) return LANGUAGE_ALIASES[raw]
  const base = raw.split(/[-_]/)[0]
  return LANGUAGE_ALIASES[base] || base
}

function slugify(value = ''){
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function compareLanguageCodes(a, b){
  const aa = normalizeLanguageCode(a)
  const bb = normalizeLanguageCode(b)
  if (aa === bb) return 0
  if (aa === DEFAULT_SONG_LANGUAGE) return -1
  if (bb === DEFAULT_SONG_LANGUAGE) return 1
  return getLanguageChipLabel(aa).localeCompare(getLanguageChipLabel(bb), undefined, { sensitivity: 'base' })
}

function coerceStringList(value){
  if (Array.isArray(value)) return value.filter(Boolean).map((x) => String(x))
  if (value == null) return []
  return [String(value)]
}

export function normalizeLanguageCode(value, fallback = DEFAULT_SONG_LANGUAGE){
  const key = toLangKey(value)
  if (key) return key
  return toLangKey(fallback) || DEFAULT_SONG_LANGUAGE
}

export function getLanguageChipLabel(code){
  const key = normalizeLanguageCode(code)
  return LANGUAGE_LABELS[key] || key.toUpperCase()
}

export function detectUiLanguage(fallback = DEFAULT_SONG_LANGUAGE){
  try {
    const docLang = typeof document !== 'undefined' ? document.documentElement?.lang : ''
    const nav = typeof navigator !== 'undefined' ? navigator : null
    const candidates = [
      docLang,
      ...(Array.isArray(nav?.languages) ? nav.languages : []),
      nav?.language,
      typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().locale : '',
    ].filter(Boolean)
    for (const value of candidates) {
      const normalized = toLangKey(value)
      if (normalized) return normalized
    }
  } catch {}
  return normalizeLanguageCode(fallback)
}

export function readSongLanguagePreference(fallback = ''){
  try {
    const raw = localStorage.getItem(SONG_LANGUAGE_STORAGE_KEY)
    if (!raw) return normalizeLanguageCode(fallback || detectUiLanguage())
    return normalizeLanguageCode(raw)
  } catch {
    return normalizeLanguageCode(fallback || detectUiLanguage())
  }
}

export function writeSongLanguagePreference(code){
  try {
    localStorage.setItem(SONG_LANGUAGE_STORAGE_KEY, normalizeLanguageCode(code))
  } catch {}
}

export function resolveInitialSongLanguage(availableLanguages = [], fallback = DEFAULT_SONG_LANGUAGE){
  const available = Array.isArray(availableLanguages)
    ? availableLanguages.map((c) => normalizeLanguageCode(c)).filter(Boolean)
    : []
  const saved = readSongLanguagePreference(fallback)
  if (!available.length) return saved
  if (available.includes(saved)) return saved
  const detected = detectUiLanguage(fallback)
  if (available.includes(detected)) return detected
  if (available.includes(DEFAULT_SONG_LANGUAGE)) return DEFAULT_SONG_LANGUAGE
  return available[0]
}

export function normalizeSongEntry(entry){
  if (!entry || !entry.id) return null
  const language = normalizeLanguageCode(
    entry.language || entry.lang || entry.locale || DEFAULT_SONG_LANGUAGE
  )
  const songId = slugify(
    entry.songId || entry.song_id || entry.translationGroup || entry.translation_group || entry.id
  ) || slugify(entry.id)
  return {
    ...entry,
    filename: entry.filename || `${entry.id}.chordpro`,
    language,
    songId,
    tags: coerceStringList(entry.tags),
    authors: coerceStringList(entry.authors),
  }
}

export function resolveGroupEntry(group, language){
  if (!group) return null
  const lang = normalizeLanguageCode(language)
  return group.byLanguage.get(lang) || group.defaultEntry || group.variants[0] || null
}

export function hasGroupLanguage(group, language){
  if (!group) return false
  const lang = normalizeLanguageCode(language)
  return group.byLanguage.has(lang)
}

export function buildSongCatalog(rawItems = []){
  const byId = new Map()
  const groupBySongId = new Map()
  const groupByEntryId = new Map()

  for (const raw of rawItems || []) {
    const item = normalizeSongEntry(raw)
    if (!item) continue
    if (byId.has(item.id)) continue
    byId.set(item.id, item)

    const key = item.songId || slugify(item.id)
    if (!groupBySongId.has(key)) {
      groupBySongId.set(key, {
        songId: key,
        variants: [],
        byLanguage: new Map(),
        languages: [],
        defaultEntry: null,
      })
    }
    const group = groupBySongId.get(key)
    group.variants.push(item)
    if (!group.byLanguage.has(item.language)) {
      group.byLanguage.set(item.language, item)
    }
    groupByEntryId.set(item.id, group)
  }

  const groups = Array.from(groupBySongId.values())
  const translationLanguageCounts = {}

  for (const group of groups) {
    group.variants.sort(compareSongsByTitle)
    group.languages = Array.from(group.byLanguage.keys()).sort(compareLanguageCodes)
    group.defaultEntry =
      group.byLanguage.get(DEFAULT_SONG_LANGUAGE) ||
      group.variants.find((v) => !v.incomplete) ||
      group.variants[0] ||
      null
    if (group.variants.length > 1) {
      for (const code of group.languages) {
        translationLanguageCounts[code] = (translationLanguageCounts[code] || 0) + 1
      }
    }
  }

  groups.sort((a, b) => compareSongsByTitle(a.defaultEntry, b.defaultEntry))

  const allLanguages = Array.from(
    groups.reduce((set, group) => {
      for (const code of group.languages) set.add(code)
      return set
    }, new Set())
  ).sort(compareLanguageCodes)

  const translationLanguages = Object.keys(translationLanguageCounts).sort(compareLanguageCodes)

  return {
    items: Array.from(byId.values()),
    byId,
    groups,
    groupBySongId,
    groupByEntryId,
    allLanguages,
    translationLanguages,
    translationLanguageCounts,
  }
}

export function getGroupByEntryId(catalog, entryId){
  if (!catalog || !catalog.groupByEntryId) return null
  return catalog.groupByEntryId.get(String(entryId)) || null
}

export function getEntryById(catalog, entryId){
  if (!catalog || !catalog.byId) return null
  return catalog.byId.get(String(entryId)) || null
}

export function resolveCatalogEntry(catalog, entryId, language){
  const group = getGroupByEntryId(catalog, entryId)
  if (group) return resolveGroupEntry(group, language)
  return getEntryById(catalog, entryId)
}

export function buildGroupSearchText(group){
  if (!group) return ''
  const chunks = []
  for (const entry of group.variants || []) {
    chunks.push(entry.title || '')
    chunks.push((entry.tags || []).join(' '))
    chunks.push((entry.authors || []).join(' '))
  }
  return chunks.join(' ').trim()
}
