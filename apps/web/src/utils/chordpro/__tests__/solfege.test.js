import { describe, it, expect } from 'vitest'
import { symToSolfege, formatChord, formatKeyDisplay, rootToSolfege } from '../solfege'

describe('rootToSolfege', () => {
  it('maps naturals (Turkish convention)', () => {
    expect(rootToSolfege('C')).toBe('Do')
    expect(rootToSolfege('D')).toBe('Re')
    expect(rootToSolfege('E')).toBe('Mi')
    expect(rootToSolfege('F')).toBe('Fa')
    expect(rootToSolfege('G')).toBe('Sol')
    expect(rootToSolfege('A')).toBe('La')
    expect(rootToSolfege('B')).toBe('Si')
  })
  it('preserves accidentals', () => {
    expect(rootToSolfege('C#')).toBe('Do#')
    expect(rootToSolfege('Bb')).toBe('Sib')
    expect(rootToSolfege('F#')).toBe('Fa#')
    expect(rootToSolfege('Eb')).toBe('Mib')
  })
})

describe('symToSolfege', () => {
  it('preserves chord qualities and extensions', () => {
    expect(symToSolfege('Am')).toBe('Lam')
    expect(symToSolfege('Dsus4')).toBe('Resus4')
    expect(symToSolfege('Gmaj7')).toBe('Solmaj7')
    expect(symToSolfege('F#m7')).toBe('Fa#m7')
    expect(symToSolfege('Ebmaj7')).toBe('Mibmaj7')
    expect(symToSolfege('C7')).toBe('Do7')
  })
  it('handles slash chords', () => {
    expect(symToSolfege('G/B')).toBe('Sol/Si')
    expect(symToSolfege('C/E')).toBe('Do/Mi')
    expect(symToSolfege('Bb/D')).toBe('Sib/Re')
    expect(symToSolfege('F#m/A')).toBe('Fa#m/La')
  })
  it('passes through unknown tokens unchanged', () => {
    expect(symToSolfege('')).toBe('')
    expect(symToSolfege('N.C.')).toBe('N.C.')
  })
})

describe('formatChord', () => {
  it('passes through letters when style=letters or omitted', () => {
    expect(formatChord('Em')).toBe('Em')
    expect(formatChord('C/G', { style: 'letters' })).toBe('C/G')
  })
  it('produces solfège when style=solfege', () => {
    expect(formatChord('Em', { style: 'solfege' })).toBe('Mim')
    expect(formatChord('G/B', { style: 'solfege' })).toBe('Sol/Si')
    expect(formatChord('Bb', { style: 'solfege' })).toBe('Sib')
  })
})

describe('formatKeyDisplay', () => {
  it('formats keys with solfège style', () => {
    expect(formatKeyDisplay('G', 'solfege')).toBe('Sol')
    expect(formatKeyDisplay('Em', 'solfege')).toBe('Mim')
    expect(formatKeyDisplay('Bb', 'solfege')).toBe('Sib')
    expect(formatKeyDisplay('G', 'letters')).toBe('G')
  })
})
