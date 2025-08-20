import { chooseBestLayout } from '../pdfLayout'

describe('edge cases', () => {
  const makeMeasureAt = (pt: number) => (text: string) => (text ? text.length * (pt * 0.6) : 0)

  test('tiny tail prefers one column', () => {
    const song = {
      meta: { title: 'Tail' },
      sections: [
        { label: 'A', lines: Array.from({ length: 25 }, () => ({ lyrics: 'aaaaaaaaaa', chords: [] })) },
        { label: 'B', lines: [{ lyrics: 'short', chords: [] }] }
      ]
    }
    const { plan } = chooseBestLayout(song as any, {}, makeMeasureAt, makeMeasureAt)
    expect(plan.columns).toBe(1)
  })

  test('very long falls back to two pages at 12pt', () => {
    const sections = Array.from({ length: 20 }, (_, i) => ({
      label: `S${i}`,
      lines: Array.from({ length: 20 }, () => ({ lyrics: 'aaaaaaaaaa', chords: [] }))
    }))
    const song = { meta: { title: 'Long' }, sections }
    const { plan } = chooseBestLayout(song as any, {}, makeMeasureAt, makeMeasureAt)
    expect(plan.lyricSizePt).toBe(12)
    expect(plan.layout.pages.length).toBe(2)
  })
})
