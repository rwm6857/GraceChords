// Diatonic chord derivation for ChordPro editor

// All valid key strings for the Key select input
export const CHROMATIC_KEYS = [
  // Major keys
  'C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B',
  // Minor keys
  'Am', 'Bbm', 'Bm', 'Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m',
]

// Hardcoded diatonic chords for each major key
// Format: [symbol, degree, display]
const MAJOR_DIATONIC = {
  'C':  [['C','I','C'],   ['Dm','ii','Dm'],   ['Em','iii','Em'],  ['F','IV','F'],   ['G','V','G'],   ['Am','vi','Am'],  ['Bdim','vii°','Bdim']],
  'Db': [['Db','I','Db'], ['Ebm','ii','Ebm'], ['Fm','iii','Fm'],  ['Gb','IV','Gb'], ['Ab','V','Ab'], ['Bbm','vi','Bbm'],['Cdim','vii°','Cdim']],
  'D':  [['D','I','D'],   ['Em','ii','Em'],   ['F#m','iii','F#m'],['G','IV','G'],   ['A','V','A'],   ['Bm','vi','Bm'],  ['C#dim','vii°','C#dim']],
  'Eb': [['Eb','I','Eb'], ['Fm','ii','Fm'],   ['Gm','iii','Gm'],  ['Ab','IV','Ab'], ['Bb','V','Bb'], ['Cm','vi','Cm'],  ['Ddim','vii°','Ddim']],
  'E':  [['E','I','E'],   ['F#m','ii','F#m'], ['G#m','iii','G#m'],['A','IV','A'],   ['B','V','B'],   ['C#m','vi','C#m'],['D#dim','vii°','D#dim']],
  'F':  [['F','I','F'],   ['Gm','ii','Gm'],   ['Am','iii','Am'],  ['Bb','IV','Bb'], ['C','V','C'],   ['Dm','vi','Dm'],  ['Edim','vii°','Edim']],
  'F#': [['F#','I','F#'], ['G#m','ii','G#m'], ['A#m','iii','A#m'],['B','IV','B'],   ['C#','V','C#'], ['D#m','vi','D#m'],['E#dim','vii°','Fdim']],
  'G':  [['G','I','G'],   ['Am','ii','Am'],   ['Bm','iii','Bm'],  ['C','IV','C'],   ['D','V','D'],   ['Em','vi','Em'],  ['F#dim','vii°','F#dim']],
  'Ab': [['Ab','I','Ab'], ['Bbm','ii','Bbm'], ['Cm','iii','Cm'],  ['Db','IV','Db'], ['Eb','V','Eb'], ['Fm','vi','Fm'],  ['Gdim','vii°','Gdim']],
  'A':  [['A','I','A'],   ['Bm','ii','Bm'],   ['C#m','iii','C#m'],['D','IV','D'],   ['E','V','E'],   ['F#m','vi','F#m'],['G#dim','vii°','G#dim']],
  'Bb': [['Bb','I','Bb'], ['Cm','ii','Cm'],   ['Dm','iii','Dm'],  ['Eb','IV','Eb'], ['F','V','F'],   ['Gm','vi','Gm'],  ['Adim','vii°','Adim']],
  'B':  [['B','I','B'],   ['C#m','ii','C#m'], ['D#m','iii','D#m'],['E','IV','E'],   ['F#','V','F#'], ['G#m','vi','G#m'],['A#dim','vii°','A#dim']],
}

// Map minor key to its relative major and the starting degree offset
const MINOR_TO_RELATIVE_MAJOR = {
  'Am':  { major: 'C',  offset: 5 },
  'Bbm': { major: 'Db', offset: 5 },
  'Bm':  { major: 'D',  offset: 5 },
  'Cm':  { major: 'Eb', offset: 5 },
  'C#m': { major: 'E',  offset: 5 },
  'Dm':  { major: 'F',  offset: 5 },
  'Ebm': { major: 'Gb', offset: 5 },
  'D#m': { major: 'Gb', offset: 5 },
  'Em':  { major: 'G',  offset: 5 },
  'Fm':  { major: 'Ab', offset: 5 },
  'F#m': { major: 'A',  offset: 5 },
  'Gm':  { major: 'Bb', offset: 5 },
  'G#m': { major: 'B',  offset: 5 },
  'Abm': { major: 'B',  offset: 5 },
}

// Natural minor degrees (relative to relative major vi position)
const MINOR_DEGREES = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII']

/**
 * Given a key string (e.g. "A", "Bb", "F#m"), return an array of 7 diatonic
 * chord objects for the major scale (or natural minor if key ends in 'm').
 *
 * Each object: { degree: 'I', symbol: 'A', display: 'A' }
 *
 * Returns null if the key is unrecognized.
 */
export function getDiatonicChords(key) {
  if (!key) return null

  // Check if it's a minor key
  const isMinor = key.endsWith('m') && key.length > 1

  if (isMinor) {
    const rel = MINOR_TO_RELATIVE_MAJOR[key]
    if (!rel) return null

    const majorChords = MAJOR_DIATONIC[rel.major]
    if (!majorChords) return null

    // Natural minor starts at vi of the relative major (index 5)
    // Rotate: [vi, vii°, I, ii, iii, IV, V] → degrees i, ii°, III, iv, v, VI, VII
    const rotated = []
    for (let i = 0; i < 7; i++) {
      const srcIndex = (5 + i) % 7
      const [symbol, , display] = majorChords[srcIndex]
      rotated.push({ degree: MINOR_DEGREES[i], symbol, display })
    }
    return rotated
  }

  // Handle Gb as alias for F# in our lookup
  const lookupKey = key === 'Gb' ? 'F#' : key

  const chords = MAJOR_DIATONIC[lookupKey]
  if (!chords) return null

  return chords.map(([symbol, degree, display]) => ({ degree, symbol, display }))
}
