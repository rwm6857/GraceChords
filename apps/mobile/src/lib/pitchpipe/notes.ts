// Pure pitch-pipe math — RN-free so it unit-tests headless. Equal temperament
// at A4 = 440 Hz over a vocal-centered span two octaves either side of the
// middle-C octave: C2 (65.41 Hz) through B6 (1975.53 Hz), defaulting to the
// middle-C octave (C4–B4, shown as offset 0).

export const CHROMATIC_NOTES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const

export const MIN_OCTAVE = 2
export const MAX_OCTAVE = 6
export const DEFAULT_OCTAVE = 4

export function clampOctave(octave: number): number {
  if (!Number.isFinite(octave)) return DEFAULT_OCTAVE
  return Math.min(MAX_OCTAVE, Math.max(MIN_OCTAVE, Math.round(octave)))
}

/** MIDI note number for a chromatic index (0 = C) at an octave (C4 = 60). */
export function midiNote(noteIndex: number, octave: number): number {
  return 12 * (octave + 1) + noteIndex
}

/** Equal-temperament frequency in Hz (A4 = 440). */
export function noteFrequency(noteIndex: number, octave: number): number {
  return 440 * Math.pow(2, (midiNote(noteIndex, octave) - 69) / 12)
}
