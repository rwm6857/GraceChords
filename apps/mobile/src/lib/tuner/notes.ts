// Pure note math for the tuner. RN-free so it unit-tests headless.
// Standard tuning only for v1; the string list is data, so alternate tunings
// can be added later by passing a different array.

export interface TunerString {
  /** Display letter (what the string row shows). */
  label: string
  /** Scientific pitch name, unique per string. */
  name: string
  /** Target fundamental in Hz (A4 = 440). */
  frequency: number
}

export const STANDARD_TUNING: readonly TunerString[] = [
  { label: 'E', name: 'E2', frequency: 82.4069 },
  { label: 'A', name: 'A2', frequency: 110.0 },
  { label: 'D', name: 'D3', frequency: 146.8324 },
  { label: 'G', name: 'G3', frequency: 195.9977 },
  { label: 'B', name: 'B3', frequency: 246.9417 },
  { label: 'E', name: 'E4', frequency: 329.6276 },
]

/** Signed cents from `reference` to `frequency` (positive = sharp). */
export function centsBetween(frequency: number, reference: number): number {
  return 1200 * Math.log2(frequency / reference)
}

export interface StringReading {
  string: TunerString
  cents: number
}

/**
 * Picks the tuning string nearest (in cents) to a detected frequency.
 * Returns null for frequencies wildly outside the guitar range, where a
 * "nearest string" reading would be meaningless noise.
 */
export function nearestString(
  frequency: number,
  tuning: readonly TunerString[] = STANDARD_TUNING
): StringReading | null {
  if (!Number.isFinite(frequency) || frequency <= 0) return null
  let best: StringReading | null = null
  for (const string of tuning) {
    const cents = centsBetween(frequency, string.frequency)
    if (best === null || Math.abs(cents) < Math.abs(best.cents)) {
      best = { string, cents }
    }
  }
  // More than ~4 semitones from every string: not a plausible string pitch.
  if (best && Math.abs(best.cents) > 400) return null
  return best
}
