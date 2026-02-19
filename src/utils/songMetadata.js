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

const INHERIT_RULES = [
  { field: 'originalKey', presenceKey: 'key', type: 'string' },
  { field: 'tags', presenceKey: 'tags', type: 'array' },
  { field: 'authors', presenceKey: 'authors', type: 'array' },
  { field: 'country', presenceKey: 'country', type: 'string' },
  { field: 'youtube', presenceKey: 'youtube', type: 'string' },
  { field: 'mp3', presenceKey: 'mp3', type: 'string' },
  { field: 'pptx', presenceKey: 'pptx', type: 'string' },
]

function hasOwn(obj, key){
  return Object.prototype.hasOwnProperty.call(obj || {}, key)
}

function normalizeLanguageCode(value, fallback = 'en'){
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return fallback
  if (LANGUAGE_ALIASES[raw]) return LANGUAGE_ALIASES[raw]
  const base = raw.split(/[-_]/)[0]
  return LANGUAGE_ALIASES[base] || base || fallback
}

function isEmptyValue(type, value){
  if (type === 'array') return !Array.isArray(value) || value.length === 0
  return !String(value || '').trim()
}

function cloneValue(type, value){
  if (type === 'array') return Array.isArray(value) ? [...value] : []
  return String(value || '')
}

function pickMasterEntry(items){
  const list = Array.isArray(items) ? items : []
  if (!list.length) return null
  const english = list.filter((it) => normalizeLanguageCode(it?.language) === 'en')
  return (
    english.find((it) => !it?.incomplete) ||
    english[0] ||
    list.find((it) => !it?.incomplete) ||
    list[0] ||
    null
  )
}

function hasExplicitOverride(item, rule){
  if (item?._metaPresence?.[rule.presenceKey] !== true) return false
  return !isEmptyValue(rule.type, item?.[rule.field])
}

export function buildMetaPresence(meta = {}){
  return {
    key: hasOwn(meta, 'key'),
    tags: hasOwn(meta, 'tags'),
    authors: hasOwn(meta, 'authors'),
    country: hasOwn(meta, 'country'),
    youtube: hasOwn(meta, 'youtube'),
    mp3: hasOwn(meta, 'mp3'),
    pptx: hasOwn(meta, 'pptx'),
  }
}

export function inheritTranslationMetadata(items = []){
  const list = Array.isArray(items) ? items : []
  const groups = new Map()

  for (const item of list) {
    if (!item) continue
    const songId = String(item.songId || item.id || '').trim()
    if (!songId) continue
    if (!groups.has(songId)) groups.set(songId, [])
    groups.get(songId).push(item)
  }

  for (const groupItems of groups.values()) {
    const master = pickMasterEntry(groupItems)
    if (!master) continue
    for (const item of groupItems) {
      if (!item || item === master) continue
      for (const rule of INHERIT_RULES) {
        if (hasExplicitOverride(item, rule)) continue
        if (!isEmptyValue(rule.type, item[rule.field])) continue
        if (isEmptyValue(rule.type, master[rule.field])) continue
        item[rule.field] = cloneValue(rule.type, master[rule.field])
      }
    }
  }

  return list
}

export function stripSongIndexInternalFields(items = []){
  return (Array.isArray(items) ? items : []).map((item) => {
    const { _metaPresence, _analysis, ...rest } = item || {}
    return rest
  })
}
