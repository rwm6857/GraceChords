import { describe, expect, it } from 'vitest'
import {
  CHROMATIC_NOTES,
  DEFAULT_OCTAVE,
  MAX_OCTAVE,
  MIN_OCTAVE,
  clampOctave,
  midiNote,
  noteFrequency,
} from '../notes'

const A = CHROMATIC_NOTES.indexOf('A')
const C = CHROMATIC_NOTES.indexOf('C')
const B = CHROMATIC_NOTES.indexOf('B')

describe('pitch pipe notes', () => {
  it('lays out the 12 chromatic notes from C', () => {
    expect(CHROMATIC_NOTES).toHaveLength(12)
    expect(CHROMATIC_NOTES[0]).toBe('C')
    expect(new Set(CHROMATIC_NOTES).size).toBe(12)
  })

  it('maps note + octave to MIDI (C4 = 60, A4 = 69)', () => {
    expect(midiNote(C, 4)).toBe(60)
    expect(midiNote(A, 4)).toBe(69)
  })

  it('produces equal-temperament reference frequencies', () => {
    expect(noteFrequency(A, 4)).toBeCloseTo(440, 9) // A4
    expect(noteFrequency(C, 4)).toBeCloseTo(261.6256, 3) // middle C
    expect(noteFrequency(CHROMATIC_NOTES.indexOf('E'), 4)).toBeCloseTo(329.6276, 3)
    expect(noteFrequency(CHROMATIC_NOTES.indexOf('F#'), 3)).toBeCloseTo(184.9972, 3)
  })

  it('shifts by exactly one octave per octave step', () => {
    for (let i = 0; i < 12; i++) {
      expect(noteFrequency(i, 5) / noteFrequency(i, 4)).toBeCloseTo(2, 9)
      expect(noteFrequency(i, 3) / noteFrequency(i, 4)).toBeCloseTo(0.5, 9)
    }
  })

  it('spans the vocal-centered C3–B5 range around a C4 default', () => {
    expect(DEFAULT_OCTAVE).toBe(4)
    expect(noteFrequency(C, MIN_OCTAVE)).toBeCloseTo(130.8128, 3) // C3
    expect(noteFrequency(B, MAX_OCTAVE)).toBeCloseTo(987.7666, 3) // B5
  })

  it('clamps octaves to the supported range', () => {
    expect(clampOctave(2)).toBe(MIN_OCTAVE)
    expect(clampOctave(9)).toBe(MAX_OCTAVE)
    expect(clampOctave(4)).toBe(4)
    expect(clampOctave(Number.NaN)).toBe(DEFAULT_OCTAVE)
  })
})
