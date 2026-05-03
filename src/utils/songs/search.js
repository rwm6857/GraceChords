/**
 * Word-prefix song search.
 *
 * A result is included only when the query (or each of its space-separated
 * tokens) matches the START of at least one word in a relevant field — never
 * an arbitrary mid-word position.  This prevents "q" matching "Psalm" or
 * "tr" matching "Stronger".
 *
 * Scoring (lower = better match):
 *   0   – normalized title starts with the full query
 *   0.5 – a variant title starts with the full query
 *   1   – all query tokens are word-prefixes in the title
 *   1.5 – all query tokens are word-prefixes in a variant title
 *   2   – any query token is a word-prefix in the title
 *   2.5 – any query token is a word-prefix in a variant title
 *   3   – any query token is a prefix of any tag name
 *   4   – any query token is a word-prefix in any author name
 *
 * Returns Array<{item, score}> sorted by score ascending.
 * Returns [] when query is blank (caller should show all items).
 */

function norm(str) {
  return (str || '')
    .toLowerCase()
    .replace(/['‘’ʼ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function wordList(str) {
  return norm(str).split(' ').filter(Boolean)
}

function anyWordStartsWith(words, token) {
  for (let i = 0; i < words.length; i++) {
    if (words[i].startsWith(token)) return true
  }
  return false
}

function scoreItem(item, q, tokens) {
  const titleNorm = norm(item.title)
  const titleWords = wordList(item.title)

  if (titleNorm.startsWith(q)) return 0

  if (tokens.every(t => anyWordStartsWith(titleWords, t))) return 1

  if (tokens.some(t => anyWordStartsWith(titleWords, t))) return 2

  const variantTitles = item.searchTitles || []
  for (let i = 0; i < variantTitles.length; i++) {
    const vt = variantTitles[i]
    const vtNorm = norm(vt)
    const vtWords = wordList(vt)
    if (vtNorm.startsWith(q)) return 0.5
    if (tokens.every(t => anyWordStartsWith(vtWords, t))) return 1.5
    if (tokens.some(t => anyWordStartsWith(vtWords, t))) return 2.5
  }

  const allTags = (item.tags || []).concat(item.searchTags || [])
  for (let i = 0; i < allTags.length; i++) {
    const tagNorm = norm(allTags[i])
    if (tokens.some(t => tagNorm.startsWith(t))) return 3
  }

  const allAuthors = (item.authors || []).concat(item.searchAuthors || [])
  for (let i = 0; i < allAuthors.length; i++) {
    const authorWords = wordList(allAuthors[i])
    if (tokens.some(t => anyWordStartsWith(authorWords, t))) return 4
  }

  return Infinity
}

export function searchSongs(items, query) {
  const q = norm(query)
  if (!q) return []
  const tokens = q.split(' ').filter(Boolean)

  const scored = []
  for (let i = 0; i < items.length; i++) {
    const score = scoreItem(items[i], q, tokens)
    if (score < Infinity) scored.push({ item: items[i], score })
  }

  scored.sort((a, b) => a.score - b.score)
  return scored
}
