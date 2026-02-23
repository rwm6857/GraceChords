const ACRONYM_TAG_KEYS = new Set(['icp'])

export function normalizeTagKey(tag) {
  const key = String(tag || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  return key
}

function sentenceCaseFromKey(key) {
  if (!key) return ''
  return key.charAt(0).toUpperCase() + key.slice(1)
}

export function tagLabelFromKey(key) {
  if (!key) return ''
  if (ACRONYM_TAG_KEYS.has(key)) return key.toUpperCase()
  return sentenceCaseFromKey(key)
}

export function canonicalizeTags(tags = [], tagMap) {
  const seen = new Set()
  const keys = []
  const labels = []
  for (const raw of tags) {
    const key = normalizeTagKey(raw)
    if (!key || seen.has(key)) continue
    seen.add(key)
    keys.push(key)
    labels.push(tagMap?.get(key) || tagLabelFromKey(key))
  }
  return { keys, labels }
}

export function buildTagMap(items = []) {
  const keys = new Set()
  for (const item of items) {
    for (const raw of item?.tags || []) {
      const key = normalizeTagKey(raw)
      if (key) keys.add(key)
    }
  }
  const map = new Map()
  for (const key of keys) {
    map.set(key, tagLabelFromKey(key))
  }
  return map
}

