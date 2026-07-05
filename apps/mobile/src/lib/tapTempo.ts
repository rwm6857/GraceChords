// Pure tap-tempo math — RN-free so it unit-tests headless. A rolling window of
// recent tap intervals is averaged into a BPM; a gap longer than `staleGapMs`
// abandons the old run and starts a fresh one (whose first tap, like the very
// first tap overall, yields no BPM yet).

export interface TapTempoOptions {
  /** Rolling window: how many recent intervals are averaged (default 6). */
  windowSize?: number
  /** A gap longer than this abandons the run and starts over (default 2 s). */
  staleGapMs?: number
}

export interface TapTempo {
  /** Register a tap at `nowMs`. Returns the running BPM, or null on a run's first tap. */
  tap(nowMs: number): number | null
  reset(): void
}

export function createTapTempo({ windowSize = 6, staleGapMs = 2000 }: TapTempoOptions = {}): TapTempo {
  let lastTapMs: number | null = null
  let intervals: number[] = []
  return {
    tap(nowMs: number): number | null {
      if (lastTapMs !== null) {
        const gap = nowMs - lastTapMs
        // Non-increasing timestamps are treated like a stale gap: start over
        // rather than derive a nonsense (infinite/negative) BPM.
        if (gap > staleGapMs || gap <= 0) {
          intervals = []
        } else {
          intervals.push(gap)
          if (intervals.length > windowSize) intervals.shift()
        }
      }
      lastTapMs = nowMs
      if (intervals.length === 0) return null
      const avgMs = intervals.reduce((sum, v) => sum + v, 0) / intervals.length
      return 60000 / avgMs
    },
    reset() {
      lastTapMs = null
      intervals = []
    },
  }
}
