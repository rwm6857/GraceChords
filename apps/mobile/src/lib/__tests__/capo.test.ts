import { describe, expect, it } from 'vitest'
import { capoChipValues, capoFret, capoHint } from '../capo'

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

describe('capoHint / capoChipValues', () => {
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

  it('returns the fret + display key for interpolation', () => {
    expect(capoChipValues(-2, 'G')).toEqual({ fret: 2, key: 'A' })
    expect(capoChipValues(-3, 'D')).toEqual({ fret: 3, key: 'F' })
    expect(capoChipValues(-1, 'A', true)).toEqual({ fret: 1, key: 'Bb' })
  })

  it('is hidden for zero and upward transposes', () => {
    expect(capoChipValues(0, 'G')).toBeNull()
    expect(capoChipValues(2, 'G')).toBeNull()
    expect(capoHint(3, 'C')).toBeNull()
  })

  it('is hidden without a displayed key', () => {
    expect(capoChipValues(-2, '')).toBeNull()
  })

  it('follows the solfège display style', () => {
    expect(capoChipValues(-2, 'G', false, 'solfege')).toEqual({ fret: 2, key: 'La' })
  })
})
