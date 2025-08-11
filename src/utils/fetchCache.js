// src/utils/fetchCache.js
const textCache = new Map() // url -> Promise<string>

export function fetchTextCached(url) {
  if (textCache.has(url)) return textCache.get(url)
  const p = fetch(url)
    .then(r => {
      if (!r.ok) throw new Error(`Failed to fetch ${url}: ${r.status} ${r.statusText}`)
      return r.text()
    })
    .catch(err => {
      // Don't cache failures so callers can retry
      textCache.delete(url)
      throw err
    })
  textCache.set(url, p)
  return p
}
