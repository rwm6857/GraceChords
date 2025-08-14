import { describe, it, expect } from 'vitest'
import { planSongRender } from '../../export/planSongRender'

describe('planSongRender', () => {
  const makeSong = (sections) => ({
    title: 'Test',
    lyricsBlocks: Array.from({ length: sections }, (_, i) => ({
      section: `S${i}`,
      lines: [{ plain: 'line', chordPositions: [] }],
    })),
  })

  it('auto columns choose 1 for short and 2 for long', () => {
    const shortPlan = planSongRender(makeSong(2))
    const longPlan = planSongRender(makeSong(20))
    expect(shortPlan.columns).toBe(1)
    expect(longPlan.columns).toBe(2)
  })

  it('sections keepTogether', () => {
    const plan = planSongRender(makeSong(2))
    const sections = plan.blocks.filter((b) => b.kind === 'section')
    expect(sections.every((s) => s.keepTogether)).toBe(true)
  })

  it('docTitle propagates', () => {
    const plan = planSongRender(makeSong(1), { docTitle: 'My Doc' })
    expect(plan.docTitle).toBe('My Doc')
  })
})
