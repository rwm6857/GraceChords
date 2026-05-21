// Parses a DM body into an ordered list of setlist items.
// Examples:
//   "Build My Life"                   → [{ title: "Build My Life" }]
//   "Build My Life in G"              → [{ title: "Build My Life", key: "G" }]
//   "Build My Life in G, 10000 Reasons in A"
//     → [
//         { title: "Build My Life", key: "G" },
//         { title: "10000 Reasons", key: "A" },
//       ]
//   Multi-line input is treated the same way as commas.

function normalizeKey(raw) {
  if (!raw) return null
  const trimmed = String(raw).trim()
  if (!trimmed) return null
  // Normalize flats: "Bb", "B♭", "B-flat", "B flat"
  const flatMatch = trimmed.match(/^([A-Ga-g])\s*(?:b|♭|-?flat)$/i)
  if (flatMatch) return flatMatch[1].toUpperCase() + 'b'
  // Sharps: "F#", "F♯", "F-sharp"
  const sharpMatch = trimmed.match(/^([A-Ga-g])\s*(?:#|♯|-?sharp)$/i)
  if (sharpMatch) return sharpMatch[1].toUpperCase() + '#'
  // Plain key letter
  const plain = trimmed.match(/^([A-Ga-g])$/)
  if (plain) return plain[1].toUpperCase()
  // Minor keys: "Am", "Bbm"
  const minor = trimmed.match(/^([A-Ga-g])(b|#|♭|♯)?m(?:in(?:or)?)?$/i)
  if (minor) {
    const base = minor[1].toUpperCase()
    const accidental = minor[2] ? (minor[2] === '♭' ? 'b' : minor[2] === '♯' ? '#' : minor[2]) : ''
    return `${base}${accidental}m`
  }
  return null
}

function parseItem(raw) {
  let s = String(raw || '').trim()
  if (!s) return null

  // Defensive cap. Per-item input post-split shouldn't exceed a couple
  // hundred chars; keeps the suffix parsing below trivially bounded.
  if (s.length > 500) s = s.slice(0, 500)

  // Normalise whitespace runs to a single space up front so the suffix
  // parsing below can use plain string ops with no nested-quantifier regex
  // (avoids polynomial backtracking on adversarial whitespace).
  s = s.replace(/\s+/g, ' ')

  let key = null

  // " in <key>" suffix. lastIndexOf is O(n); no regex backtracking.
  const lower = s.toLowerCase()
  const inIdx = lower.lastIndexOf(' in ')
  if (inIdx > 0 && inIdx + 4 < s.length) {
    const candidate = normalizeKey(s.slice(inIdx + 4))
    if (candidate) {
      s = s.slice(0, inIdx).trim()
      key = candidate
    }
  }

  if (!key) {
    // Bare trailing key, e.g. "Build My Life G". Take the last whitespace-
    // or comma-delimited token; accept only if it normalises to a key and
    // the prefix is non-trivial.
    let sep = -1
    for (let i = s.length - 1; i >= 0; i--) {
      const ch = s.charCodeAt(i)
      if (ch === 32 /* space */ || ch === 44 /* comma */) { sep = i; break }
    }
    if (sep > 1 && sep < s.length - 1) {
      const tail = s.slice(sep + 1)
      const candidate = normalizeKey(tail)
      if (candidate && s.slice(0, sep).trim().length >= 2) {
        s = s.slice(0, sep).trim()
        key = candidate
      }
    }
  }

  if (!s) return null
  return { title: s, key }
}

export function parseRequest(message) {
  const body = String(message || '').trim()
  if (!body) return []

  // Split on newlines OR commas — both separate songs.
  // A trailing " in <key>" must stay attached to its title, so we split on
  // top-level commas/newlines only. A comma inside a "(…)" parenthetical
  // wouldn't survive Telegram anyway, but be defensive.
  const parts = []
  let depth = 0
  let cur = ''
  for (const ch of body) {
    if (ch === '(') depth++
    if (ch === ')') depth = Math.max(0, depth - 1)
    if ((ch === ',' || ch === '\n' || ch === ';') && depth === 0) {
      if (cur.trim()) parts.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  if (cur.trim()) parts.push(cur)

  const items = []
  for (const raw of parts) {
    const item = parseItem(raw)
    if (item) items.push(item)
  }
  return items
}
