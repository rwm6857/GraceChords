import { describe, it, expect } from 'vitest'
import { chooseBestLayoutAuto } from '../../pdf'

const case3 = `
{start_of_verse: Verse 1}
[C]a
[C]b
{end_of_verse}
{start_of_verse: Verse 2}
[C]c
[C]d
{end_of_verse}
{start_of_chorus}
[C]e
[C]f
{end_of_chorus}
{start_of_verse: Verse 3}
[C]g
[C]h
{end_of_verse}
`

describe('Planner single-page priorities & hints', () => {
  it('prefers 2-col single page over spilling to page 2 (Case 3)', async () => {
    const { plan } = await chooseBestLayoutAuto(case3)
    expect(plan.layout.pages.length).toBe(1)
    expect(plan.columns).toBe(2)
    expect(plan.lyricSizePt).toBeGreaterThanOrEqual(12)
  })

  it('2-col tiny second column guard prefers 1-col at same size', async () => {
    const tinyTail = `
{start_of_verse} [C]aaa {end_of_verse}
{start_of_verse} [C]bbb {end_of_verse}
{start_of_verse} [C]ccc {end_of_verse}
`
    const { plan } = await chooseBestLayoutAuto(tinyTail)
    expect(plan.layout.pages.length).toBe(1)
    expect(plan.columns).toBe(1)
  })
})

