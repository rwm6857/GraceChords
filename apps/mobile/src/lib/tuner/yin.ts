// YIN pitch detection (de Cheveigné & Kawahara 2002), tuned for a guitar
// tuner: cumulative-mean-normalized difference + absolute threshold +
// parabolic interpolation. Pure TS, RN-free, no allocations per call after
// construction — safe to run per audio callback.

export interface YinOptions {
  sampleRate: number
  /** Analysis window length in samples (power of two not required). */
  windowSize: number
  /** Lowest detectable fundamental, Hz. Guitar low E is 82.4. */
  fMin?: number
  /** Highest detectable fundamental, Hz. High E is 329.6. */
  fMax?: number
  /** CMNDF acceptance threshold; lower = stricter (fewer, cleaner readings). */
  threshold?: number
}

export interface PitchReading {
  frequency: number
  /** 1 - CMNDF minimum: rough periodicity confidence in [0, 1]. */
  clarity: number
}

export interface YinDetector {
  readonly windowSize: number
  /** Returns null when no periodic pitch is found in the frame. */
  detect(frame: Float32Array): PitchReading | null
}

export function createYinDetector(options: YinOptions): YinDetector {
  const { sampleRate, windowSize } = options
  const fMin = options.fMin ?? 70
  const fMax = options.fMax ?? 400
  const threshold = options.threshold ?? 0.12

  const tauMax = Math.floor(sampleRate / fMin)
  const tauMin = Math.max(2, Math.floor(sampleRate / fMax))
  if (windowSize <= tauMax + 8) {
    throw new Error(
      `windowSize ${windowSize} too small for fMin ${fMin} at ${sampleRate} Hz (needs > ${tauMax + 8})`
    )
  }
  // Integration window: what remains of the frame after the largest lag.
  const integration = windowSize - tauMax

  const cmndf = new Float32Array(tauMax + 1)

  function detect(frame: Float32Array): PitchReading | null {
    if (frame.length < windowSize) return null

    // Difference function + cumulative mean normalization in one pass.
    cmndf[0] = 1
    let runningSum = 0
    for (let tau = 1; tau <= tauMax; tau++) {
      let diff = 0
      for (let i = 0; i < integration; i++) {
        const delta = frame[i] - frame[i + tau]
        diff += delta * delta
      }
      runningSum += diff
      cmndf[tau] = runningSum === 0 ? 1 : (diff * tau) / runningSum
    }

    // Absolute threshold: first dip under threshold, then slide to its local
    // minimum. Falling back to the global minimum when nothing dips under
    // would invite octave errors, so we simply report "no pitch".
    let tau = -1
    for (let t = tauMin; t <= tauMax; t++) {
      if (cmndf[t] < threshold) {
        while (t + 1 <= tauMax && cmndf[t + 1] < cmndf[t]) t++
        tau = t
        break
      }
    }
    if (tau === -1) return null

    // Parabolic interpolation around the minimum for sub-sample precision.
    let betterTau = tau
    if (tau > tauMin && tau < tauMax) {
      const s0 = cmndf[tau - 1]
      const s1 = cmndf[tau]
      const s2 = cmndf[tau + 1]
      const denom = 2 * (2 * s1 - s2 - s0)
      if (denom !== 0) {
        const adjustment = (s2 - s0) / denom
        if (Math.abs(adjustment) < 1) betterTau = tau + adjustment
      }
    }

    return {
      frequency: sampleRate / betterTau,
      clarity: 1 - cmndf[tau],
    }
  }

  return { windowSize, detect }
}

/** RMS level of a frame — used to gate detection below the noise floor. */
export function rmsLevel(frame: Float32Array): number {
  let sum = 0
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i]
  return Math.sqrt(sum / frame.length)
}

/**
 * Decimates by an integer factor with a simple box-average pre-filter.
 * Good enough anti-aliasing for pitch tracking (energy above the new Nyquist
 * is mostly high harmonics we don't need); production quality would use a
 * proper FIR if we keep decimation at all.
 */
export function decimate(input: Float32Array, factor: number): Float32Array {
  const out = new Float32Array(Math.floor(input.length / factor))
  for (let i = 0; i < out.length; i++) {
    let sum = 0
    const base = i * factor
    for (let j = 0; j < factor; j++) sum += input[base + j]
    out[i] = sum / factor
  }
  return out
}
