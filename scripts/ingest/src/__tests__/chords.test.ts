import { describe, expect, it } from 'vitest'
import { isChordToken, normalizeChordToken } from '../utils/chords.js'

describe('chord tokens', () => {
  it('detects common chords', () => {
    expect(isChordToken('C')).toBe(true)
    expect(isChordToken('F#m7')).toBe(true)
    expect(isChordToken('Bbmaj7')).toBe(true)
    expect(isChordToken('N.C.')).toBe(true)
    expect(isChordToken('G/B')).toBe(true)
  })

  it('rejects non-chords', () => {
    expect(isChordToken('Hello')).toBe(false)
    expect(isChordToken('123')).toBe(false)
  })

  it('normalizes accidentals and case', () => {
    expect(normalizeChordToken('f♯m7')).toBe('F#m7')
    expect(normalizeChordToken('n.c.')).toBe('N.C.')
  })
})
