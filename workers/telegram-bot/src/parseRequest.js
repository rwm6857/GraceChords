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

  // Strip trailing/leading bracketed annotations like "(capo 3)" - keep only
  // the title + key for matching. We don't currently use capo metadata.
  s = s.replace(/\s+/g, ' ')

  // " in <key>" suffix (case-insensitive). Anchor at the end of the string.
  let key = null
  const inMatch = s.match(/^(.*?)\s+in\s+([A-Ga-g][b#♭♯]?m?(?:in(?:or)?)?|[A-Ga-g][-\s]?(?:flat|sharp)?m?)\s*$/i)
  if (inMatch) {
    const candidate = normalizeKey(inMatch[2])
    if (candidate) {
      s = inMatch[1].trim()
      key = candidate
    }
  } else {
    // Bare trailing key, e.g. "Build My Life G". Only accept if the trailing
    // token is unambiguously a key (1-3 chars with accidentals/m).
    const tailMatch = s.match(/^(.*?)[\s,]+([A-G][b#♭♯]?m?)\s*$/)
    if (tailMatch) {
      const candidate = normalizeKey(tailMatch[2])
      if (candidate && tailMatch[1].trim().length >= 2) {
        s = tailMatch[1].trim()
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
