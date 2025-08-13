import { describe, it, expect } from 'vitest'
import { planSongRender } from '../../export/planSongRender'

const makeSong = (title: string, lines = 16) => ({
  id: title.toLowerCase().replace(/\s+/g, '-'),
  title,
  sections: [
    { type: 'Verse 1', lines: Array.from({ length: lines }, (_, i) => `line ${i+1}`) },
    { type: 'Chorus', lines: ['a', 'b', 'c', 'd'] },
  ],
})

describe('planSongRender', () => {
  it('sets docTitle and never-split sections', () => {
    const plan = planSongRender(makeSong('Glorious King'), { baseFontPt: 12 })
    expect(plan.docTitle).toContain('Glorious King')
    const section = plan.blocks.find(b => b.kind === 'section') as any
    expect(section?.keepTogether).toBe(true)
    expect(section?.keepLastNWithNext).toBe(2)
  })
  it('auto-picks columns by content size', () => {
    expect(planSongRender(makeSong('Short', 8)).columns).toBe(1)
    expect(planSongRender(makeSong('Long', 64)).columns).toBe(2)
  })
})
