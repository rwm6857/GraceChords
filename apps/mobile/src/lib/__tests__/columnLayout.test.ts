import { describe, expect, it } from 'vitest'
import { columnMeasureKey, partitionSections, type MeasureInputs } from '../columnLayout'

const VIEWPORT = 1000
const GAP = 10

/** Stacked single-column height at column width (what a naive consumer sums). */
function stacked(heights: number[], gap: number): number {
  return heights.reduce((a, b) => a + b, 0) + gap * Math.max(0, heights.length - 1)
}

describe('partitionSections (fill-first, never balanced)', () => {
  it('stays single when the whole song fits one viewport', () => {
    const heights = [200, 200, 200]
    expect(partitionSections(heights, VIEWPORT, GAP, 620)).toEqual({ mode: 'single' })
  })

  it('stays single even when double is selected but the song fits (no near-empty column)', () => {
    // singleHeight (full-width render) fits exactly at the viewport.
    expect(partitionSections([500, 480], VIEWPORT, GAP, VIEWPORT)).toEqual({ mode: 'single' })
  })

  it('splits a classic 1.x-viewport song: full column 1, remainder in column 2', () => {
    const heights = [300, 300, 300, 300, 300]
    // col1: 300 + 10+300 + 10+300 = 920; next (10+300) would hit 1230 > 1000.
    expect(partitionSections(heights, VIEWPORT, GAP, stacked(heights, GAP))).toEqual({
      mode: 'double',
      col2Start: 3,
    })
  })

  it('is greedy fill-first, not balanced: column 1 packs to the brim', () => {
    const heights = [900, 100, 100, 100]
    // Balanced packing would move sections left/right; fill-first keeps 900 in
    // col 1 and only adds what still fits under the viewport.
    expect(partitionSections(heights, VIEWPORT, GAP, stacked(heights, GAP))).toEqual({
      mode: 'double',
      col2Start: 1,
    })
  })

  it('an oversized single section still anchors column 1 (it scrolls; never split)', () => {
    const heights = [2400, 300, 300]
    expect(partitionSections(heights, VIEWPORT, GAP, stacked(heights, GAP))).toEqual({
      mode: 'double',
      col2Start: 1,
    })
  })

  it('empty and one-section songs stay single', () => {
    expect(partitionSections([], VIEWPORT, GAP, 0)).toEqual({ mode: 'single' })
    expect(partitionSections([5000], VIEWPORT, GAP, 5000)).toEqual({ mode: 'single' })
  })

  it('stays single when the viewport is unmeasurable', () => {
    expect(partitionSections([300, 300, 300], 0, GAP, 900)).toEqual({ mode: 'single' })
    expect(partitionSections([300, 300, 300], -1, GAP, 900)).toEqual({ mode: 'single' })
  })

  it('accounts for the inter-section gap when packing column 1', () => {
    // Without the gap both fit (500+500 = 1000); with it the second overflows.
    expect(partitionSections([500, 500], VIEWPORT, GAP, 1010)).toEqual({
      mode: 'double',
      col2Start: 1,
    })
  })

  it('stays single when overflow was width-induced only (all fit one column at column width)', () => {
    // singleHeight overflows, but the measured column heights all fit stacked —
    // degenerate, keep single rather than an empty second column.
    expect(partitionSections([400, 400], VIEWPORT, GAP, 1200)).toEqual({ mode: 'single' })
  })
})

describe('columnMeasureKey (height-cache invalidation)', () => {
  const base: MeasureInputs = {
    width: 800,
    fontScale: 1,
    steps: 0,
    preferFlat: false,
    chordStyle: 'letters',
    showChords: true,
    showSections: true,
  }

  it('is stable for identical inputs', () => {
    expect(columnMeasureKey({ ...base })).toBe(columnMeasureKey({ ...base }))
  })

  it('invalidates on transpose — the critical dependency', () => {
    expect(columnMeasureKey({ ...base, steps: 2 })).not.toBe(columnMeasureKey(base))
  })

  it('invalidates on width, font size, and every other layout-affecting option', () => {
    const variants: MeasureInputs[] = [
      { ...base, width: 700 },
      { ...base, fontScale: 1.2 },
      { ...base, preferFlat: true },
      { ...base, chordStyle: 'solfege' },
      { ...base, showChords: false },
      { ...base, showSections: false },
    ]
    const keys = new Set([columnMeasureKey(base), ...variants.map(columnMeasureKey)])
    expect(keys.size).toBe(variants.length + 1)
  })
})
