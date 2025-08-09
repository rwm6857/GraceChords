// Improved chord parsing & transposition
const SCALE = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
const FLAT = {'Db':'C#','Eb':'D#','Gb':'F#','Ab':'G#','Bb':'A#'}

function norm(note){ return FLAT[note] || note }

function idx(note){
  const n = norm(note)
  return SCALE.indexOf(n)
}

// token patterns: root + suffix, with optional slash bass
// roots: A-G with optional # or b
// suffix: common chord quality tokens (m, maj, min, sus2/4, add, dim, aug, numbers, parentheses, +, -)
const CHORD_TOKEN = /([A-G][#b]?)([^ \t\/]*)/

export function transposeChordToken(token, steps){
  if(!token) return token
  if(token.includes('/')){
    const [left, right] = token.split('/')
    return transposeChordToken(left, steps) + '/' + transposeChordToken(right, steps)
  }
  const m = token.match(CHORD_TOKEN)
  if(!m) return token
  const root = norm(m[1])
  const suffix = m[2] || ''
  const i = SCALE.indexOf(root)
  if(i === -1) return token
  const newRoot = SCALE[(i + steps + 12) % 12]
  return newRoot + suffix
}

// conservative matcher to avoid touching lyric words:
// - token must start with chord root A-G optionally with accidental
// - allow a suffix with typical chord chars, optionally parenthetical suffix
// Conservative, chord-like token matcher
const CHORD_REGEX = new RegExp(
  String.raw`\b([A-G][#b]?(?:maj|min|m|sus(?:2|4)?|dim|aug|add)?[0-9]*(?:\([^)]+\))?(?:\/[A-G][#b]?)?)\b`,
  'g'
);

export function transposeChordLine(line, steps){
  if(!line) return ''
  return line.replace(CHORD_REGEX, (m)=> transposeChordToken(m, steps))
}
