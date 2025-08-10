// src/utils/fetchCache.js
const textCache = new Map() // url -> Promise<string>

export function fetchTextCached(url) {
  if (textCache.has(url)) return textCache.get(url)
  const p = fetch(url).then(r => r.text())
  textCache.set(url, p)
  return p
}
