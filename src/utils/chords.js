// src/utils/chords.js
// Helper to parse chord tokens and compute x positions with collision resolution

/**
 * Parse a lyric line containing [CHORD] tokens.
 * @param {string} line
 * @param {(text: string) => number} measureLyric  function returning width of lyric text
 * @param {(text: string) => number} measureChord  function returning width of chord text
 * @returns {{ lyrics: string, chords: Array<{ sym: string, x: number, w: number }> }}
 */
export function parseChordLine(line = '', measureLyric = s => s.length, measureChord = s => s.length) {
  const chords = []
  let lyrics = ''
  let x = 0
  const re = /\[([^\]]+)\]/g
  let last = 0
  let m
  while ((m = re.exec(line))) {
    const before = line.slice(last, m.index)
    lyrics += before
    x += measureLyric(before)
    const sym = m[1]
    const w = measureChord(sym)
    chords.push({ sym, x, w })
    last = m.index + m[0].length
  }
  lyrics += line.slice(last)
  const spaceW = measureLyric(' ')
  resolveChordCollisions(chords, spaceW)
  return { lyrics, chords }
}

/**
 * Resolve chord collisions by nudging left/right so neighbors stay at least
 * `spaceWidth` apart.
 * @param {Array<{x:number,w:number}>} chords
 * @param {number} spaceWidth  minimum desired gap between chords
 * @param {number} maxIter
 * @returns {Array}
 */
export function resolveChordCollisions(chords, spaceWidth = 0, maxIter = 10) {
  if (!Array.isArray(chords) || chords.length < 2) return chords
  chords.sort((a, b) => a.x - b.x)
  let changed = true
  let iter = 0
  while (changed && iter < maxIter) {
    changed = false
    iter++
    for (let i = 1; i < chords.length; i++) {
      const prev = chords[i - 1]
      const cur = chords[i]
      const gap = cur.x - (prev.x + prev.w)
      if (gap < spaceWidth) {
        const shift = Math.ceil((spaceWidth - gap) / 2)
        prev.x -= shift
        cur.x += shift
        changed = true
      }
    }
  }
  chords.sort((a, b) => a.x - b.x)
  return chords
}

