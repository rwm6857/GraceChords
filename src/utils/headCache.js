// src/utils/headCache.js
// Cache results of HEAD requests by key to avoid repeat network calls
const headCache = new Map()

export async function headOk(url, key) {
  const k = key || url
  if (headCache.has(k)) return headCache.get(k)
  try {
    const res = await fetch(url, { method: 'HEAD' })
    if (!res.ok) { headCache.set(k, false); return false }
    headCache.set(k, true)
    return true
  } catch {
    headCache.set(k, false)
    return false
  }
}

export function clearHeadCache(){
  headCache.clear()
}
