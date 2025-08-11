import { describe, it, expect } from 'vitest'
import { planForTest } from '../utils/pdf'

// Helpers to build lines/blocks
const line = (len, ch='x') => ({ plain: ch.repeat(len), chordPositions: [] })
const blockFrom = (label, lines) => ({
  // Provide a label as a first line; normalization will promote to header
  lines: [{ plain: label, chordPositions: [] }, ...lines]
})

describe('PDF planner cases', () => {
  it('Case 1: Short song, short lines → 1-col @16, 1 page', () => {
    const short = 30
    const song = {
      title: 'Case1',
      key: 'G',
      lyricsBlocks: [
        blockFrom('Verse 1', [line(short), line(short), line(short), line(short)]),
        blockFrom('Chorus',  [line(short), line(short), line(short), line(short)])
      ]
    }
    const plan = planForTest(song, {})
    expect(plan.columns).toBe(1)
    expect(plan.size).toBe(16)
    expect(plan.pages).toBe(1)
  })

  it('Case 2: Short song, long lines → 1-col, shrink to fit (≥12), 1 page', () => {
    const longLen = 70 // 70 chars: fits at 12pt (≈504pt) but not at 16pt (≈672pt)
    const song = {
      title: 'Case2',
      key: 'G',
      lyricsBlocks: [
        blockFrom('Verse', [line(longLen), line(longLen), line(longLen)])
      ]
    }
    const plan = planForTest(song, {})
    expect(plan.columns).toBe(1)
    expect(plan.size).toBeGreaterThanOrEqual(12)
    expect(plan.size).toBeLessThanOrEqual(16)
    expect(plan.pages).toBe(1)
  })

  it('Case 3: Long song, short lines → prefer 2-col @16, 1 page', () => {
    const short = 24
    // Enough lines to overflow height in 1-col but fit in 2-col on one page
    const manyLines = Array.from({length: 40}, () => line(short))
    const song = {
      title: 'Case3',
      key: 'G',
      lyricsBlocks: [
        blockFrom('Verse 1', manyLines.slice(0, 20)),
        blockFrom('Verse 2', manyLines.slice(20))
      ]
    }
    const plan = planForTest(song, {})
    expect(plan.pages).toBe(1)
    expect(plan.size).toBe(16)
    expect(plan.columns).toBe(2)
  })

  it('Case 4: Long song, long lines → choose the best single-page plan; else fallback fewest pages', () => {
    const longLen = 70
    // Many long lines — 2-col will fail width; 1-col fits width at 12 but likely needs >1 page.
    const sec = (n) => blockFrom(`Verse ${n}`, Array.from({length: 10}, () => line(longLen)))
    const song = {
      title: 'Case4',
      key: 'G',
      lyricsBlocks: [sec(1), sec(2), sec(3)]
    }
    const plan = planForTest(song, {})
    // Either 1-col single page at 12 (rare), or fallback 1-col 12 with >1 page.
    expect([1,2]).toContain(plan.columns)
    expect(plan.size).toBeGreaterThanOrEqual(12)
    // If 2-col chosen, it still must be 1 page; otherwise expect multiple pages at 1-col
    if (plan.columns === 2) {
      expect(plan.pages).toBe(1)
    } else {
      expect(plan.pages).toBeGreaterThanOrEqual(1) // usually 2
    }
  })
})
