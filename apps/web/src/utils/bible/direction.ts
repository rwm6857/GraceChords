const RTL_LANGUAGE_CODES = new Set([
  'ar',
  'arc',
  'ckb',
  'dv',
  'fa',
  'he',
  'iw',
  'ku',
  'ps',
  'sd',
  'ug',
  'ur',
  'yi',
])

export function normalizeBibleLanguageCode(raw: unknown){
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
}

export function isRtlBibleLanguage(raw: unknown){
  const normalized = normalizeBibleLanguageCode(raw)
  if (!normalized) return false
  const base = normalized.split('-')[0]
  return RTL_LANGUAGE_CODES.has(base)
}
