import Fuse from 'fuse.js'

export function makeFuseIndex(items){
  return new Fuse(items, {
    keys: [
      { name: 'title', weight: 0.5 },
      { name: 'tags', weight: 0.2 },
      { name: 'lyricsBlocks.lines.text', weight: 0.3 }
    ],
    includeScore: true,
    threshold: 0.35,
    ignoreLocation: true,
    minMatchCharLength: 2
  })
}

export function runSearch(fuse, query, fallback){
  if(!query) return fallback
  const res = fuse.search(query)
  return res.map(r=>r.item)
}
