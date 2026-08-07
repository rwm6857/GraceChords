import { describe, expect, it } from 'vitest'
import {
  FALLBACK_SCALE,
  FONT_SCALES,
  columnMeasureKey,
  columnWidthFor,
  instrumentalFits,
  packOrdered,
  planColumns,
  sampleKey,
  type MeasureInputs,
  type PlanInput,
} from '../columnLayout'

const GAP = 12

/** Stacked height of a run of sections, including the gaps between them. */
function stacked(heights: number[], gap = GAP): number {
  return heights.reduce((a, b) => a + b, 0) + gap * Math.max(0, heights.length - 1)
}

/** Column heights implied by a set of cuts, for asserting on balance. */
function columnHeights(heights: number[], cuts: number[], gap = GAP): number[] {
  return cuts.map((start, i) =>
    stacked(heights.slice(start, i + 1 < cuts.length ? cuts[i + 1] : heights.length), gap),
  )
}

describe('packOrdered', () => {
  it('keeps everything in one column when asked for one', () => {
    const heights = [100, 200, 300]
    expect(packOrdered(heights, GAP, 1)).toEqual({ cuts: [0], maxHeight: stacked(heights) })
  })

  it('splits evenly when sections are uniform', () => {
    const heights = [100, 100, 100, 100, 100, 100]
    const { cuts } = packOrdered(heights, GAP, 3)
    expect(cuts).toEqual([0, 2, 4])
    expect(columnHeights(heights, cuts)).toEqual([212, 212, 212])
  })

  it('preserves reading order — cuts are strictly increasing', () => {
    const { cuts } = packOrdered([90, 310, 40, 275, 120, 60], GAP, 3)
    expect(cuts[0]).toBe(0)
    for (let i = 1; i < cuts.length; i++) expect(cuts[i]).toBeGreaterThan(cuts[i - 1])
  })

  it('FIXES the stranded-column bug: a tall early section no longer empties column 1', () => {
    // Two short verses, a tall chorus, then more. The old fill-first rule broke
    // at the FIRST section that overflowed a 1000pt viewport — leaving column 1
    // holding just the two 250s (~512pt, half empty) and column 2 holding the
    // rest (~1486pt of scrolling).
    const heights = [250, 250, 700, 250, 250, 250]
    const { cuts, maxHeight } = packOrdered(heights, GAP, 2)

    expect(cuts).toEqual([0, 3])
    const cols = columnHeights(heights, cuts)
    expect(cols).toEqual([1224, 774])
    expect(maxHeight).toBe(1224)

    // The old behaviour, for contrast: column 1 stops at index 2.
    const oldCols = columnHeights(heights, [0, 2])
    expect(oldCols[0]).toBe(512)
    expect(oldCols[1]).toBe(1486)
    // Strictly less scrolling than the old split.
    expect(maxHeight).toBeLessThan(Math.max(...oldCols))
  })

  it('minimizes the tallest column — no other ordered split does better', () => {
    const heights = [250, 250, 700, 250, 250, 250]
    const best = packOrdered(heights, GAP, 3).maxHeight
    // Brute-force every ordered 3-way split.
    let brute = Infinity
    for (let a = 1; a < heights.length - 1; a++) {
      for (let b = a + 1; b < heights.length; b++) {
        brute = Math.min(brute, Math.max(...columnHeights(heights, [0, a, b])))
      }
    }
    expect(best).toBe(brute)
  })

  it('breaks ties toward fuller earlier columns', () => {
    // 5 x 300: splitting at 2 or at 3 both give a 936pt tallest column, so the
    // earlier column should take the extra section.
    const heights = [300, 300, 300, 300, 300]
    expect(packOrdered(heights, GAP, 2).cuts).toEqual([0, 3])
  })

  it('a section taller than every other still anchors its own column', () => {
    const heights = [2400, 300, 300]
    const { cuts, maxHeight } = packOrdered(heights, GAP, 2)
    expect(cuts).toEqual([0, 1])
    // Bounded below by the tallest single section — two columns delay overflow,
    // they don't eliminate it.
    expect(maxHeight).toBe(2400)
  })

  it('collapses when there are fewer sections than columns', () => {
    expect(packOrdered([100, 100], GAP, 3).cuts).toHaveLength(2)
    expect(packOrdered([100], GAP, 3).cuts).toEqual([0])
    expect(packOrdered([], GAP, 3)).toEqual({ cuts: [0], maxHeight: 0 })
  })

  it('accounts for the inter-section gap', () => {
    expect(packOrdered([100, 100], 0, 1).maxHeight).toBe(200)
    expect(packOrdered([100, 100], 50, 1).maxHeight).toBe(250)
  })
})

describe('instrumentalFits (horizontal spill guard)', () => {
  it('passes songs with no chord-only rows', () => {
    expect(instrumentalFits(0, 100, 14)).toBe(true)
  })

  it('rejects a chord row wider than the column', () => {
    // 40 chars at 14pt mono ≈ 336pt.
    expect(instrumentalFits(40, 240, 14)).toBe(false)
    expect(instrumentalFits(40, 400, 14)).toBe(true)
  })

  it('scales with the font — the same row fits at a smaller size', () => {
    expect(instrumentalFits(30, 240, 14 * 1.6)).toBe(false)
    expect(instrumentalFits(30, 240, 14 * 0.8)).toBe(true)
  })

  it('rejects an unmeasurable column', () => {
    expect(instrumentalFits(10, 0, 14)).toBe(false)
  })
})

describe('columnWidthFor', () => {
  it('returns the full width for one column and subtracts gaps beyond that', () => {
    expect(columnWidthFor(1000, 20, 1)).toBe(1000)
    expect(columnWidthFor(1000, 20, 2)).toBe(490)
    expect(columnWidthFor(1000, 20, 3)).toBe(320)
  })
})

// ---------------------------------------------------------------------------
// planColumns
// ---------------------------------------------------------------------------

/**
 * Drive the planner to completion against a height model, collecting the
 * (columns, fontScale) passes it asked for. `heightAt` stands in for the
 * offscreen measurement the component does.
 */
function runPlanner(
  base: Omit<PlanInput, 'samples'>,
  heightAt: (columns: number, scale: number) => number[],
) {
  const samples = new Map<string, number[]>()
  const asked: Array<{ columns: number; fontScale: number }> = []
  for (let i = 0; i < 60; i++) {
    const step = planColumns({ ...base, samples })
    if (step.kind === 'done') return { plan: step.plan, asked }
    asked.push({ columns: step.columns, fontScale: step.fontScale })
    samples.set(sampleKey(step.columns, step.fontScale), heightAt(step.columns, step.fontScale))
  }
  throw new Error('planner did not converge')
}

const BASE: Omit<PlanInput, 'samples'> = {
  sectionCount: 6,
  maxColumns: 3,
  gap: GAP,
  columnGap: 16,
  contentWidth: 1100,
  viewportHeight: 800,
  viewportHeightChromeHidden: 900,
  chordFontSize: 14,
  maxMonoRowChars: 0,
  fontScale: null,
}

/**
 * Simple height model: every section is `unit` tall at scale 1 in one column,
 * grows linearly with the font scale, and gets taller as columns narrow
 * (more wrapping).
 */
function model(unit: number, sectionCount = 6) {
  return (columns: number, scale: number) =>
    new Array<number>(sectionCount).fill(unit * scale * (1 + 0.12 * (columns - 1)))
}

describe('planColumns tiers', () => {
  it('tier 1: fits with the chrome visible, at the largest scale that fits', () => {
    // 6 x 40pt sections: one column at 1.6 is 6*64 + 5*12 = 444 — fits 800.
    const { plan } = runPlanner(BASE, model(40))
    expect(plan.fit).toBe('chrome')
    expect(plan.fontScale).toBe(1.6)
    expect(plan.columns).toBe(1)
  })

  it('prefers the FEWEST columns at equal font size (the picker is a ceiling)', () => {
    const { plan } = runPlanner({ ...BASE, maxColumns: 3 }, model(40))
    // Three columns would also fit at 1.6, but one column reads better.
    expect(plan.columns).toBe(1)
    expect(plan.cuts).toEqual([0])
  })

  it('spends the extra columns on a bigger font when one column cannot', () => {
    // 6 x 200pt: one column at 0.8 is 6*160 + 60 = 1020 > 800 — never fits.
    // Two columns at 1.0 are ~3*224 + 24 = 696 — fits.
    const { plan } = runPlanner(BASE, model(200))
    expect(plan.fit).toBe('chrome')
    expect(plan.columns).toBeGreaterThan(1)
    expect(plan.fontScale).toBeGreaterThan(0.8)
  })

  it('tier 2: only fits once the chrome hides', () => {
    // Tuned so nothing fits in 800 but the smallest size fits in 900.
    const heights = (columns: number, scale: number) =>
      new Array<number>(3).fill((900 - 24) / 3 / 0.8 * scale * (columns > 1 ? 4 : 1))
    const { plan } = runPlanner({ ...BASE, sectionCount: 3, maxColumns: 2 }, heights)
    expect(plan.fit).toBe('chromeHidden')
    expect(plan.columns).toBe(1)
    expect(plan.fontScale).toBe(0.8)
  })

  it('tier 3: nothing fits — falls back to the ceiling, balanced, at FALLBACK_SCALE', () => {
    const { plan } = runPlanner(BASE, model(900))
    expect(plan.fit).toBe('scroll')
    expect(plan.fontScale).toBe(FALLBACK_SCALE)
    expect(plan.columns).toBe(3)
    expect(plan.cuts).toEqual([0, 2, 4])
  })

  it('binary-searches the ladder instead of walking all 9 steps', () => {
    const { asked } = runPlanner({ ...BASE, maxColumns: 1 }, model(200))
    expect(asked.length).toBeLessThanOrEqual(Math.ceil(Math.log2(FONT_SCALES.length)) + 1)
  })

  it('never asks for the same pass twice', () => {
    const { asked } = runPlanner(BASE, model(200))
    const keys = asked.map((a) => sampleKey(a.columns, a.fontScale))
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('planColumns guards', () => {
  it('renders a plain single column before layout reports dimensions', () => {
    const step = planColumns({ ...BASE, contentWidth: 0, samples: new Map() })
    expect(step).toEqual({
      kind: 'done',
      plan: { columns: 1, fontScale: FALLBACK_SCALE, cuts: [0], fit: 'scroll' },
    })
    const noHeight = planColumns({ ...BASE, viewportHeight: 0, samples: new Map() })
    expect(noHeight.kind).toBe('done')
  })

  it('handles an empty song without measuring anything', () => {
    const step = planColumns({ ...BASE, sectionCount: 0, samples: new Map() })
    expect(step).toEqual({
      kind: 'done',
      plan: { columns: 1, fontScale: FALLBACK_SCALE, cuts: [0], fit: 'chrome' },
    })
  })

  it('never plans more columns than there are sections', () => {
    const { plan } = runPlanner({ ...BASE, sectionCount: 2, maxColumns: 3 }, model(900, 2))
    expect(plan.columns).toBeLessThanOrEqual(2)
  })

  it('refuses a column count whose width would wrap the chord rows', () => {
    // A 60-char instrumental row needs ~504pt at 14pt mono; three columns of
    // ~356pt cannot take it, so the plan drops to fewer columns.
    const { plan } = runPlanner({ ...BASE, maxMonoRowChars: 60 }, model(900))
    expect(plan.columns).toBeLessThan(3)
  })
})

describe('planColumns with a manual font size', () => {
  it('honours the pinned scale and only searches the column count', () => {
    const { plan, asked } = runPlanner({ ...BASE, fontScale: 1.2 }, model(200))
    expect(plan.fontScale).toBe(1.2)
    expect(asked.every((a) => a.fontScale === 1.2)).toBe(true)
  })

  it('still prefers the fewest columns that fit at that size', () => {
    const { plan } = runPlanner({ ...BASE, fontScale: 0.8 }, model(40))
    expect(plan.columns).toBe(1)
  })

  it('falls back to scrolling at the pinned size when nothing fits', () => {
    const { plan } = runPlanner({ ...BASE, fontScale: 1.6 }, model(900))
    expect(plan.fit).toBe('scroll')
    expect(plan.fontScale).toBe(1.6)
  })
})

describe('columnMeasureKey (sample-cache invalidation)', () => {
  const base: MeasureInputs = {
    width: 700,
    steps: 0,
    preferFlat: false,
    chordStyle: 'letters',
    showChords: true,
    showSections: true,
  }

  it('is stable for identical inputs', () => {
    expect(columnMeasureKey({ ...base })).toBe(columnMeasureKey({ ...base }))
  })

  it('changes when any wrapping-relevant input changes', () => {
    const variants: MeasureInputs[] = [
      { ...base, width: 701 },
      { ...base, steps: 2 },
      { ...base, preferFlat: true },
      { ...base, chordStyle: 'solfege' },
      { ...base, showChords: false },
      { ...base, showSections: false },
    ]
    const keys = new Set([columnMeasureKey(base), ...variants.map(columnMeasureKey)])
    expect(keys.size).toBe(variants.length + 1)
  })

  it('does NOT include columns or font scale — those live in sampleKey', () => {
    expect(sampleKey(2, 1.1)).not.toBe(sampleKey(3, 1.1))
    expect(sampleKey(2, 1.1)).not.toBe(sampleKey(2, 1.2))
  })
})
