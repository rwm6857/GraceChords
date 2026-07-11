import { describe, expect, it } from 'vitest'
import { createTapTempo } from '../tapTempo'

function tapSeries(tapper: ReturnType<typeof createTapTempo>, start: number, intervals: number[]) {
  let now = start
  let bpm: number | null = tapper.tap(now)
  for (const gap of intervals) {
    now += gap
    bpm = tapper.tap(now)
  }
  return bpm
}

function tapSeries2(
  tapper: ReturnType<typeof createTapTempo>,
  start: number,
  intervals: number[],
  windowSize: number
) {
  let now = start
  let bpm: number | null = tapper.tap(now, windowSize)
  for (const gap of intervals) {
    now += gap
    bpm = tapper.tap(now, windowSize)
  }
  return bpm
}

describe('createTapTempo', () => {
  it('returns null on the first tap', () => {
    expect(createTapTempo().tap(1000)).toBeNull()
  })

  it('computes BPM from even intervals', () => {
    // 500 ms between taps = 120 BPM
    expect(tapSeries(createTapTempo(), 0, [500, 500, 500])).toBeCloseTo(120, 6)
    // 1000 ms = 60 BPM
    expect(tapSeries(createTapTempo(), 0, [1000, 1000])).toBeCloseTo(60, 6)
    // 250 ms = 240 BPM
    expect(tapSeries(createTapTempo(), 0, [250, 250, 250, 250])).toBeCloseTo(240, 6)
  })

  it('averages uneven intervals', () => {
    // 400/600/500 ms → mean 500 ms → 120 BPM
    expect(tapSeries(createTapTempo(), 0, [400, 600, 500])).toBeCloseTo(120, 6)
  })

  it('only averages over the rolling window', () => {
    const tapper = createTapTempo({ windowSize: 4 })
    // Four slow intervals (1000 ms), then four fast (500 ms): the window now
    // holds only the fast ones, so the slow start no longer drags the BPM.
    const bpm = tapSeries(tapper, 0, [1000, 1000, 1000, 1000, 500, 500, 500, 500])
    expect(bpm).toBeCloseTo(120, 6)
  })

  it('honors a per-tap window (X most recent taps)', () => {
    const tapper = createTapTempo()
    // Window of 3 gaps (4 taps). Three slow gaps then three fast: only the fast
    // ones remain, so a new slow→fast switch catches up within a measure.
    const bpm = tapSeries2(tapper, 0, [1000, 1000, 1000, 500, 500, 500], 3)
    expect(bpm).toBeCloseTo(120, 6)
  })

  it('shrinking the window mid-run drops older gaps at once', () => {
    const tapper = createTapTempo()
    // Fill five 1000 ms gaps under a wide window...
    tapSeries2(tapper, 0, [1000, 1000, 1000, 1000, 1000], 6)
    // ...then a single 500 ms tap under a window of 1 → only that gap counts.
    expect(tapper.tap(5500, 1)).toBeCloseTo(120, 6)
  })

  it('a window of 1 uses only the single most recent gap (2/4 case)', () => {
    const tapper = createTapTempo()
    expect(tapper.tap(0, 1)).toBeNull()
    expect(tapper.tap(1000, 1)).toBeCloseTo(60, 6)
    // The next gap fully replaces the tempo — no smoothing.
    expect(tapper.tap(1500, 1)).toBeCloseTo(120, 6)
  })

  it('resets after a stale gap and needs a fresh second tap', () => {
    const tapper = createTapTempo({ staleGapMs: 2000 })
    expect(tapSeries(tapper, 0, [500, 500])).toBeCloseTo(120, 6)
    // 5 s pause: the run is abandoned; this tap starts a new one with no BPM.
    expect(tapper.tap(6000)).toBeNull()
    // The new run's tempo owes nothing to the old 120 BPM run.
    expect(tapper.tap(6750)).toBeCloseTo(80, 6)
  })

  it('reset() clears the run', () => {
    const tapper = createTapTempo()
    tapSeries(tapper, 0, [500, 500])
    tapper.reset()
    expect(tapper.tap(2000)).toBeNull()
  })

  it('treats a non-increasing timestamp as a fresh run', () => {
    const tapper = createTapTempo()
    tapSeries(tapper, 1000, [500])
    expect(tapper.tap(1500)).toBeNull()
  })
})
