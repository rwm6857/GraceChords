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
