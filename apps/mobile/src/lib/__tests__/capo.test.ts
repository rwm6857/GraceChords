import { describe, expect, it } from 'vitest'
import { capoChipLabel, capoFret, capoHint } from '../capo'

describe('capoFret', () => {
  it('has no capo at zero or upward transpose', () => {
    expect(capoFret(0)).toBeNull()
    expect(capoFret(1)).toBeNull()
    expect(capoFret(5)).toBeNull()
    expect(capoFret(12)).toBeNull()
  })

  it('maps a downward transpose to its fret', () => {
    expect(capoFret(-1)).toBe(1)
    expect(capoFret(-2)).toBe(2)
    expect(capoFret(-11)).toBe(11)
  })

  it('needs no capo a whole octave down, and folds beyond-octave drops', () => {
    expect(capoFret(-12)).toBeNull()
    expect(capoFret(-14)).toBe(2)
  })

  it('rejects non-finite input', () => {
    expect(capoFret(Number.NaN)).toBeNull()
  })
})

describe('capoHint / capoChipLabel', () => {
  it('computes fret + sounding key for several keys', () => {
    // Chart shows G after 2 down from A: capo 2 sounds A.
    expect(capoHint(-2, 'G')).toEqual({ fret: 2, soundingKey: 'A' })
    // D shapes, 3 down from F.
    expect(capoHint(-3, 'D')).toEqual({ fret: 3, soundingKey: 'F' })
    // C shapes, 4 down from E.
    expect(capoHint(-4, 'C')).toEqual({ fret: 4, soundingKey: 'E' })
    // Minor keys ride along: Dm shapes, 2 down from Em.
    expect(capoHint(-2, 'Dm')).toEqual({ fret: 2, soundingKey: 'Em' })
  })

  it('honors the flat preference in the sounding key', () => {
    expect(capoHint(-1, 'A', true)).toEqual({ fret: 1, soundingKey: 'Bb' })
    expect(capoHint(-1, 'A', false)).toEqual({ fret: 1, soundingKey: 'A#' })
  })

  it('renders the exact chip text', () => {
    expect(capoChipLabel(-2, 'G')).toBe('Capo 2 for A')
    expect(capoChipLabel(-3, 'D')).toBe('Capo 3 for F')
    expect(capoChipLabel(-1, 'A', true)).toBe('Capo 1 for Bb')
  })

  it('is hidden for zero and upward transposes', () => {
    expect(capoChipLabel(0, 'G')).toBeNull()
    expect(capoChipLabel(2, 'G')).toBeNull()
    expect(capoHint(3, 'C')).toBeNull()
  })

  it('is hidden without a displayed key', () => {
    expect(capoChipLabel(-2, '')).toBeNull()
  })

  it('follows the solfège display style', () => {
    expect(capoChipLabel(-2, 'G', false, 'solfege')).toBe('Capo 2 for La')
  })
})
