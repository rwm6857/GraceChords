import { readFileSync } from 'fs'
import { normalizeSongInput, chooseBestLayout } from '../pdfLayout'

describe('Holy Forever layout', () => {
  const makeMeasureAt = (pt: number) => (text: string) => (text ? text.length * (pt * 0.6) : 0)
  const songText = readFileSync(__dirname + '/fixtures/holy_forever.chordpro', 'utf8')
  const song = normalizeSongInput(songText)

  test('fits single page two columns without splits', () => {
    const { plan } = chooseBestLayout(song, {}, makeMeasureAt, makeMeasureAt)
    expect(plan.layout.pages.length).toBe(1)
    expect(plan.columns).toBe(2)
    expect(plan.lyricSizePt).toBeGreaterThanOrEqual(14)
    expect(plan.lyricSizePt).toBeLessThanOrEqual(15)
    const headers: string[] = []
    for (const col of plan.layout.pages[0].columns) {
      for (const b of col.blocks) {
        if (b.type === 'section') headers.push(b.header)
      }
    }
    const set = new Set(headers)
    expect(set.size).toBe(headers.length)
  })
})
