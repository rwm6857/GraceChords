// Shared helpers for quick action logic (tag matching and random picks)
export function normalizeTag(tag){
  return String(tag || '').trim().toLowerCase()
}

export function hasTag(song, tag){
  const needle = normalizeTag(tag)
  if (!needle) return false
  const tags = Array.isArray(song?.tags) ? song.tags.map(normalizeTag) : []
  return tags.includes(needle)
}

export function filterByTag(songs = [], tag){
  const needle = normalizeTag(tag)
  if (!needle) return []
  return songs.filter((s) => hasTag(s, needle))
}

export function pickRandom(list = []){
  if (!Array.isArray(list) || !list.length) return null
  const idx = Math.floor(Math.random() * list.length)
  return list[idx] ?? null
}

export function pickManyRandom(list = [], count = 0){
  const pool = Array.isArray(list) ? list.slice() : []
  const out = []
  if (count <= 0 || !pool.length) return out
  while (out.length < count && pool.length){
    const idx = Math.floor(Math.random() * pool.length)
    const [chosen] = pool.splice(idx, 1)
    if (chosen) out.push(chosen)
  }
  return out
}
