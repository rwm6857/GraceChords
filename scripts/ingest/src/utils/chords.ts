const TOKEN_PATTERNS = [
  'maj',
  'min',
  'm',
  'dim',
  'aug',
  'sus2',
  'sus4',
  'sus',
  'add13',
  'add11',
  'add9',
  'add',
  '13',
  '11',
  '9',
  '7',
  '6',
  '5',
  '4',
  '2'
]

function normalizeAccidentals(input: string): string {
  return input
    .replace(/♯/g, '#')
    .replace(/♭/g, 'b')
}

export function normalizeChordToken(input: string): string {
  const trimmed = normalizeAccidentals(input.trim())
  if (!trimmed) return ''

  const upper = trimmed.toUpperCase()
  if (upper === 'N.C.' || upper === 'NC' || upper === 'N.C') {
    return 'N.C.'
  }

  const match = trimmed.match(/^([A-Ga-g])([#b]?)(.*)$/)
  if (!match) return trimmed

  const root = match[1].toUpperCase() + match[2]
  let rest = match[3]

  let bass = ''
  const slashIndex = rest.indexOf('/')
  if (slashIndex !== -1) {
    bass = rest.slice(slashIndex + 1)
    rest = rest.slice(0, slashIndex)
  }

  const normalizedRest = rest.toLowerCase()
  let normalizedBass = ''
  if (bass) {
    const bassMatch = normalizeAccidentals(bass).match(/^([A-Ga-g])([#b]?)$/)
    if (bassMatch) {
      normalizedBass = '/' + bassMatch[1].toUpperCase() + bassMatch[2]
    } else {
      normalizedBass = '/' + bass
    }
  }

  return `${root}${normalizedRest}${normalizedBass}`
}

export function isChordToken(input: string): boolean {
  const trimmed = normalizeAccidentals(input.trim())
  if (!trimmed) return false

  const upper = trimmed.toUpperCase()
  if (upper === 'N.C.' || upper === 'NC' || upper === 'N.C') {
    return true
  }

  const match = trimmed.match(/^([A-Ga-g])([#b]?)(.*)$/)
  if (!match) return false

  let rest = match[3]
  if (!rest) return true

  const slashIndex = rest.indexOf('/')
  if (slashIndex !== -1) {
    const bass = rest.slice(slashIndex + 1)
    if (!bass.match(/^[A-Ga-g][#b]?$/)) return false
    rest = rest.slice(0, slashIndex)
  }

  let remaining = rest.toLowerCase()
  while (remaining.length > 0) {
    const token = TOKEN_PATTERNS.find((pattern) => remaining.startsWith(pattern))
    if (!token) return false
    remaining = remaining.slice(token.length)
  }

  return true
}

export function extractChordTokens(line: string): { token: string; index: number }[] {
  const tokens: { token: string; index: number }[] = []
  const regex = /\S+/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(line)) !== null) {
    const token = match[0]
    if (isChordToken(token)) {
      tokens.push({ token: normalizeChordToken(token), index: match.index })
    }
  }
  return tokens
}

export function normalizeChordLine(line: string): string {
  return line.replace(/\[([^\]]+)\]/g, (_, token) => {
    const normalized = normalizeChordToken(token)
    return `[${normalized}]`
  })
}
