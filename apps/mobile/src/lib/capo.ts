// Capo hint for the Song Viewer. A capo raises the pitch of played shapes, so
// a capo position exists only when the chart is transposed DOWN from the key
// the song should sound in: shapes N semitones below the target + capo at
// fret N sound the target key. Zero or upward transposes have no capo
// equivalent and yield no hint. Key math reuses @gracechords/core — nothing
// musical is reimplemented here.

import { formatKeyDisplay, transposeSymPrefer } from '@gracechords/core'

/**
 * Capo fret for a signed transpose (`delta` = semitones the chart was moved
 * relative to the sounding key; the Viewer's ± taps accumulate this). Null
 * when no capo applies: zero/upward transpose, or a whole number of octaves.
 */
export function capoFret(delta: number): number | null {
  if (!Number.isFinite(delta) || delta >= 0) return null
  const fret = -delta % 12
  return fret === 0 ? null : fret
}

export interface CapoHint {
  fret: number
  /** The key the capoed shapes sound in (the pre-transpose target key). */
  soundingKey: string
}

export function capoHint(delta: number, displayedKey: string, preferFlat = false): CapoHint | null {
  const fret = capoFret(delta)
  if (fret === null || !displayedKey) return null
  return { fret, soundingKey: transposeSymPrefer(displayedKey, fret, preferFlat) }
}

/**
 * Interpolation values for the capo chip (`song:viewer.capo` → "Capo {{fret}}
 * for {{key}}"), or null when the chip is hidden. Kept RN/i18n-free — the
 * Viewer formats the string through its own `t`.
 */
export function capoChipValues(
  delta: number,
  displayedKey: string,
  preferFlat = false,
  chordStyle: 'letters' | 'solfege' = 'letters'
): { fret: number; key: string } | null {
  const hint = capoHint(delta, displayedKey, preferFlat)
  if (!hint) return null
  return { fret: hint.fret, key: formatKeyDisplay(hint.soundingKey, chordStyle) }
}
