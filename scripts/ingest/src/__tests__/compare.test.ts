import { describe, expect, it } from 'vitest'
import { compareChordPro } from '../compare.js'

describe('compareChordPro', () => {
  it('reports perfect match for identical content', () => {
    const expected = '{title: Test}\n[C]Hello\n'
    const actual = '{title: Test}\n[C]Hello\n'
    const result = compareChordPro(expected, actual)
    expect(result.matchScore).toBe(100)
    expect(result.lineMatchRate).toBe(1)
    expect(result.chordMismatchCount).toBe(0)
  })

  it('flags chord mismatches when chords differ', () => {
    const expected = '[C]Hello world\n'
    const actual = '[G]Hello world\n'
    const result = compareChordPro(expected, actual)
    expect(result.chordMismatchCount).toBe(1)
    expect(result.matchScore).toBeLessThan(100)
  })

  it('ignores metadata and section label differences', () => {
    const expected = '{title: Test}\n{sov Verse 1}\n[C]Hello\n{eov}\n'
    const actual = '{title: Test}\n{start_of_verse Verse 1}\n[C]Hello\n{end_of_verse}\n'
    const result = compareChordPro(expected, actual)
    expect(result.matchScore).toBe(100)
    expect(result.chordMismatchCount).toBe(0)
  })

  it('treats slash chords as equivalent to base chord', () => {
    const expected = '[D]Hello\n'
    const actual = '[D/F#]Hello\n'
    const result = compareChordPro(expected, actual)
    expect(result.matchScore).toBe(100)
    expect(result.chordMismatchCount).toBe(0)
  })

  it('lowers match score when lines differ', () => {
    const expected = 'Line one\nLine two\n'
    const actual = 'Line one\nLine three\n'
    const result = compareChordPro(expected, actual)
    expect(result.matchScore).toBeLessThan(100)
    expect(result.lineMatchRate).toBeLessThan(1)
    expect(result.diff).toContain('- Line two')
    expect(result.diff).toContain('+ Line three')
  })

  it('enforces strict chord matching when requested', () => {
    const expected = '[D]Hello\n'
    const actual = '[D/F#]Hello\n'
    const result = compareChordPro(expected, actual, { strictChords: true })
    expect(result.matchScore).toBeLessThan(100)
    expect(result.chordMismatchCount).toBe(1)
  })

  it('keeps minor vs major distinct in loose mode', () => {
    const expected = '[E]Hello\n'
    const actual = '[Em]Hello\n'
    const result = compareChordPro(expected, actual)
    expect(result.chordMismatchCount).toBe(1)
  })

  it('compares only lyrics when requested', () => {
    const expected = '[C]Hello world\n'
    const actual = '[G]Hello world\n'
    const result = compareChordPro(expected, actual, { compareLyrics: true })
    expect(result.matchScore).toBe(100)
  })

  it('compares only chords when requested', () => {
    const expected = '[C]Hello world\n'
    const actual = '[C]Hi world\n'
    const result = compareChordPro(expected, actual, { compareChords: true })
    expect(result.matchScore).toBe(100)
  })

  it('compares only sections when requested', () => {
    const expected = '{sov Verse 1}\n[C]Hello\n{eov}\n{soc}\n[C]Hey\n{eoc}\n'
    const actual = '{soc}\n[C]Hello\n{eoc}\n{sov Verse 1}\n[C]Hey\n{eov}\n'
    const result = compareChordPro(expected, actual, { compareSections: true })
    expect(result.matchScore).toBeLessThan(100)
  })

  it('ignores key header lines and comment disclaimers', () => {
    const expected = '[Am]Oh, the one who loves us\n'
    const actual = '(Key of Am)\n# --- DISCLAIMER (GraceChords) ---\n[Am]Oh, the one who loves us\n'
    const result = compareChordPro(expected, actual)
    expect(result.matchScore).toBe(100)
  })

  it('treats soc Pre-Chorus as pre-chorus section', () => {
    const expected = '{soc Pre-Chorus}\n[C]Hello\n{eoc}\n'
    const actual = '{sop}\n[C]Hello\n{eop}\n'
    const result = compareChordPro(expected, actual, { compareSections: true })
    expect(result.matchScore).toBe(100)
  })
})
