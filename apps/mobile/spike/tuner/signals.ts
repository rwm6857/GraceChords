// SPIKE-ONLY: synthetic plucked-guitar-string generator for benchmarking the
// pitch pipeline headless. Models the properties that actually break naive
// pitch detectors: string inharmonicity, per-partial decay, a noisy pluck
// attack, a weak low-E fundamental, and background noise.

/** Deterministic PRNG (mulberry32) so benchmark runs are reproducible. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface PluckOptions {
  sampleRate: number
  durationSeconds: number
  /** True fundamental in Hz (ground truth for the benchmark). */
  f0: number
  /** Silence before the pluck, seconds (models "waiting for the player"). */
  onsetSeconds?: number
  /** Number of partials to synthesize. */
  partials?: number
  /** Stiff-string inharmonicity coefficient B (f_k = k f0 sqrt(1 + B k^2)). */
  inharmonicity?: number
  /** Gain applied to the fundamental only — low E often has a weak one. */
  fundamentalGain?: number
  /** 1/k^rolloff spectral envelope for partial amplitudes. */
  rolloff?: number
  /** Base decay time constant, seconds; higher partials decay ~k^1.5 faster. */
  decaySeconds?: number
  /** Background white-noise SNR in dB relative to the pluck's initial level; Infinity = clean. */
  snrDb?: number
  seed?: number
}

export function synthPluck(options: PluckOptions): Float32Array {
  const {
    sampleRate,
    durationSeconds,
    f0,
    onsetSeconds = 0.05,
    partials = 12,
    inharmonicity = 1e-4,
    fundamentalGain = 1,
    rolloff = 1.2,
    decaySeconds = 2.5,
    snrDb = Infinity,
    seed = 1,
  } = options
  const rng = makeRng(seed)
  const length = Math.floor(durationSeconds * sampleRate)
  const out = new Float32Array(length)
  const onset = Math.floor(onsetSeconds * sampleRate)

  interface Partial {
    omega: number
    phase: number
    amp: number
    decayRate: number
  }
  const parts: Partial[] = []
  for (let k = 1; k <= partials; k++) {
    const fk = k * f0 * Math.sqrt(1 + inharmonicity * k * k)
    if (fk >= sampleRate / 2) break
    parts.push({
      omega: (2 * Math.PI * fk) / sampleRate,
      phase: rng() * 2 * Math.PI,
      amp: (1 / Math.pow(k, rolloff)) * (k === 1 ? fundamentalGain : 1),
      decayRate: Math.pow(k, 1.5) / decaySeconds,
    })
  }

  let peak = 0
  for (let i = onset; i < length; i++) {
    const t = (i - onset) / sampleRate
    // Fast attack so the first analysis window sees a transient, like a pick.
    const attack = 1 - Math.exp(-t / 0.004)
    let sample = 0
    for (const p of parts) {
      sample += p.amp * Math.exp(-t * p.decayRate) * Math.sin(p.omega * (i - onset) + p.phase)
    }
    // Short broadband pick scrape at the very start.
    if (t < 0.02) sample += (rng() * 2 - 1) * 0.3 * Math.exp(-t / 0.005)
    out[i] = sample * attack
    const abs = Math.abs(out[i])
    if (abs > peak) peak = abs
  }

  // Normalize to a nominal level, then add background noise at the target SNR.
  const level = 0.5
  const gain = peak > 0 ? level / peak : 1
  const noiseAmp = Number.isFinite(snrDb) ? level * Math.pow(10, -snrDb / 20) : 0
  for (let i = 0; i < length; i++) {
    out[i] = out[i] * gain + (noiseAmp > 0 ? (rng() * 2 - 1) * noiseAmp : 0)
  }
  return out
}
