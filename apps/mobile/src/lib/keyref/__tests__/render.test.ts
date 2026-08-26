import { describe, expect, it } from 'vitest'
import { chordRoot, scaleDegreeNotes } from '@gracechords/core'
import {
  arcDegreeAt,
  arcPositionLabels,
  bassLabel,
  chordAccessibilityLabel,
  chordLabel,
  diatonicQuality,
  formatChordToken,
  isDiatonic,
  parseChordToken,
} from '../render'

const t = (key: string, vars: Record<string, string>) =>
  key === 'keyRef.a11yChordOverBass' ? `${vars.chord}, ${vars.bass} in the bass` : key

describe('core scale-degree spellings', () => {
  it('preserves the spelling a key writes, unlike keyRoot', () => {
    expect(chordRoot('Bbm')).toBe('Bb')
    expect(chordRoot('C#dim')).toBe('C#')
    expect(chordRoot('G/B')).toBe('G')
    expect(chordRoot('nonsense')).toBe('')
  })

  it('spells each degree for the key', () => {
    expect(scaleDegreeNotes('A')).toEqual(['A', 'B', 'C#', 'D', 'E', 'F#', 'G#'])
    expect(scaleDegreeNotes('Db')).toEqual(['Db', 'Eb', 'F', 'Gb', 'Ab', 'Bb', 'C'])
    expect(scaleDegreeNotes('G')).toEqual(['G', 'A', 'B', 'C', 'D', 'E', 'F#'])
  })

  it("reads F#'s seventh as E#, which is what spells its 5/7 correctly", () => {
    expect(scaleDegreeNotes('F#')?.[6]).toBe('E#')
  })

  it('returns null for an unrecognized key', () => {
    expect(scaleDegreeNotes('H')).toBeNull()
  })
})

describe('canonical tokens', () => {
  it('round-trips every form', () => {
    for (const token of ['1', '4', '1/3', '5/7', '2maj', '2m7', '4/6', '1/4', '5m9']) {
      expect(formatChordToken(parseChordToken(token))).toBe(token)
    }
  })

  it('reads a bare 7 as the seventh degree, never as 5/7', () => {
    expect(parseChordToken('7')).toEqual({ degree: 7 })
    expect(parseChordToken('5/7')).toEqual({ degree: 5, bass: 7 })
    // The two are different chords, and the shorthand must not collapse them.
    expect(formatChordToken(parseChordToken('7'))).not.toBe('5/7')
  })

  it('reads a bare 3 as the third degree, never as 1/3', () => {
    expect(parseChordToken('3')).toEqual({ degree: 3 })
    expect(parseChordToken('1/3')).toEqual({ degree: 1, bass: 3 })
  })

  it('throws rather than guessing at anything unrecognized', () => {
    for (const bad of ['', '0', '8', '1/', '/3', '1sus', '1/8', 'IV', '2maj/', '1/3/5']) {
      expect(() => parseChordToken(bad)).toThrow()
    }
  })
})

describe('quality', () => {
  it('knows each degree of a major scale', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((d) => diatonicQuality(d as 1))).toEqual([
      'maj', 'min', 'min', 'maj', 'maj', 'min', 'dim',
    ])
  })

  it('treats a redundant override as diatonic', () => {
    expect(isDiatonic({ degree: 2 })).toBe(true)
    expect(isDiatonic({ degree: 2, quality: 'min' })).toBe(true)
    expect(isDiatonic({ degree: 2, quality: 'maj' })).toBe(false)
    expect(isDiatonic({ degree: 1, quality: 'min' })).toBe(false)
  })
})

describe('chord and bass labels', () => {
  it('spells 1/3 correctly in every key it is spot-checked in', () => {
    const chord = parseChordToken('1/3')
    expect(chordLabel(chord, 'A', 'letters')).toBe('A/C#')
    expect(chordLabel(chord, 'G', 'letters')).toBe('G/B')
    expect(chordLabel(chord, 'F', 'letters')).toBe('F/A')
  })

  it('spells the bass note for the key rather than a generic sharp', () => {
    const chord = parseChordToken('1/3')
    expect(bassLabel(chord, 'A', 'letters')).toBe('C#')
    expect(bassLabel(chord, 'Db', 'letters')).toBe('F')
    expect(bassLabel(chord, 'F', 'letters')).toBe('A')
  })

  it('never renders 5/7 as a bare 7', () => {
    const chord = parseChordToken('5/7')
    expect(chordLabel(chord, 'A', 'numbers')).toBe('5/7')
    expect(chordLabel(chord, 'A', 'letters')).toBe('E/G#')
    expect(chordLabel(chord, 'F#', 'letters')).toBe('C#/E#')
  })

  it('applies the diatonic quality by default and the override when present', () => {
    expect(chordLabel(parseChordToken('2'), 'C', 'letters')).toBe('Dm')
    expect(chordLabel(parseChordToken('2maj'), 'C', 'letters')).toBe('D')
    expect(chordLabel(parseChordToken('7'), 'C', 'letters')).toBe('B°')
    expect(chordLabel(parseChordToken('2m7'), 'C', 'letters')).toBe('Dm7')
  })

  it('gives the numbers mode the canonical token', () => {
    expect(chordLabel(parseChordToken('2maj'), 'Db', 'numbers')).toBe('2maj')
    expect(bassLabel(parseChordToken('1/3'), 'Db', 'numbers')).toBe('3')
    expect(bassLabel(parseChordToken('4'), 'Db', 'numbers')).toBe('4')
  })

  it('falls back to the canonical token for an unknown key', () => {
    expect(chordLabel(parseChordToken('1/3'), 'H', 'letters')).toBe('1/3')
  })

  it('reads a slash chord out with its bass note', () => {
    expect(chordAccessibilityLabel(parseChordToken('1/3'), 'A', 'letters', t)).toBe(
      'A/C#, C# in the bass',
    )
    expect(chordAccessibilityLabel(parseChordToken('4'), 'A', 'letters', t)).toBe('D')
  })
})

describe('arc labels', () => {
  it('maps the visible positions to their degrees', () => {
    expect(arcDegreeAt('major', -1)).toBe(4)
    expect(arcDegreeAt('major', 0)).toBe(1)
    expect(arcDegreeAt('major', 1)).toBe(5)
    expect(arcDegreeAt('minor', -1)).toBe(2)
    expect(arcDegreeAt('minor', 0)).toBe(6)
    expect(arcDegreeAt('minor', 1)).toBe(3)
    // The inner ring runs one further right than the outer: that is the vii°.
    expect(arcDegreeAt('minor', 2)).toBe(7)
    expect(arcDegreeAt('major', 2)).toBeNull()
    expect(arcDegreeAt('minor', 3)).toBeNull()
    expect(arcDegreeAt('minor', -2)).toBeNull()
  })

  it('shows a name and a number for every diatonic position', () => {
    expect(arcPositionLabels('C', 'major', 0)).toEqual({ name: 'C', number: '1' })
    expect(arcPositionLabels('C', 'major', -1)).toEqual({ name: 'F', number: '4' })
    expect(arcPositionLabels('C', 'minor', 0)).toEqual({ name: 'Am', number: '6' })
    expect(arcPositionLabels('C', 'minor', 2)).toEqual({ name: 'B°', number: '7' })
  })

  it('shows the faded neighbours as keys with no number', () => {
    // The chord a fifth above V is a secondary dominant, not the diatonic 2 —
    // numbering it would teach the wrong chord.
    expect(arcPositionLabels('C', 'major', 2)).toEqual({ name: 'D', number: null })
    expect(arcPositionLabels('C', 'major', -2)).toEqual({ name: 'Bb', number: null })
  })

  it('respells across the enharmonic seam with the key', () => {
    expect(arcPositionLabels('F#', 'major', 1).name).toBe('C#')
    expect(arcPositionLabels('Db', 'major', 0).name).toBe('Db')
    expect(arcPositionLabels('Db', 'major', -1).name).toBe('Gb')
    expect(arcPositionLabels('F#', 'major', 0).name).toBe('F#')
  })

  it('shows a non-diatonic occupant altered rather than as the diatonic chord', () => {
    const altered = parseChordToken('2maj')
    expect(arcPositionLabels('C', 'minor', -1)).toEqual({ name: 'Dm', number: '2' })
    expect(arcPositionLabels('C', 'minor', -1, altered)).toEqual({ name: 'D', number: '2maj' })
  })
})
