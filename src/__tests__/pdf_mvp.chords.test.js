import { describe, it, expect } from 'vitest'
import { __test } from '../utils/pdf_mvp/index.js'

describe('MVP chords alignment', () => {
  it('keeps chord X positions when symbols change length', () => {
    const text = 'This is a lyric line with chords'
    // Place chords at stable character indices
    const idxs = [5, 15, 28]
    const chordsA = idxs.map(i => ({ index: i, sym: 'G' }))
    const chordsB = idxs.map(i => ({ index: i, sym: 'F#m7b5' }))
    const width = 2000 // no wrapping
    const pt = 16
    const { xs: xa } = __test.computeChordXs({ text, chords: chordsA, width, pt })
    const { xs: xb } = __test.computeChordXs({ text, chords: chordsB, width, pt })
    expect(xa.length).toBe(xb.length)
    for (let i = 0; i < xa.length; i++) {
      expect(xa[i]).toBeCloseTo(xb[i], 6)
    }
  })

  it('places trailing chords flush at end with single-space separation', () => {
    const text = 'Sing hallelujah'
    const end = text.length
    // Two chords right at the end; one just before end
    const chords = [
      { index: Math.max(0, end - 1), sym: 'E' },
      { index: end, sym: 'A' },
      { index: end, sym: 'B' }
    ]
    const width = 2000
    const pt = 16
    const { xs, lyricWidth, spaceW } = __test.computeChordXs({ text, chords, width, pt })
    // Monotonic increase with at least one space width between end-stacked chords
    expect(xs[1]).toBeGreaterThanOrEqual(xs[0] + Math.max(0.01, spaceW) - 1e-6)
    expect(xs[2]).toBeGreaterThanOrEqual(xs[1] + Math.max(0.01, spaceW) - 1e-6)
    // Last trailing chord should be at or beyond the lyric end X (flush or nudged)
    expect(xs[xs.length - 1]).toBeGreaterThanOrEqual(lyricWidth - 1e-6)
  })
})

