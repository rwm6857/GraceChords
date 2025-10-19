import { describe, it, expect } from 'vitest'
import { parseChordProOrLegacy } from '../../chordpro/parser'
import { normalizeSongInput, chooseBestLayout } from '../pdfLayout.js'

const SAMPLE = `
{title: Example}
{key: Em}
{inst Em, D, Am7, Bm7 x2}
{sov Verse 1}
[Em]Line one
{eov}
`

describe('PDF layout instrumentation', () => {
  it('keeps instrumental blocks in the final plan', () => {
    const doc = parseChordProOrLegacy(SAMPLE)
    const blocks = (doc.sections || []).map((sec) => ({
      section: sec.label,
      lines: (sec.lines || []).map((ln) => {
        if (ln.instrumental) return { instrumental: ln.instrumental }
        return { plain: ln.lyrics || '', chordPositions: ln.chords || [] }
      }),
    }))
    const song = normalizeSongInput({
      title: doc.meta.title,
      key: doc.meta.key,
      lyricsBlocks: blocks,
    })

    const measure = (pt: number) => (text: string) => text.length * pt * 0.5
    const { plan } = chooseBestLayout(song, {}, measure, measure)
    const firstColumn = plan.layout.pages[0]?.columns?.[0]?.blocks || []
    const types = firstColumn.map((b: any) => b.type)
    expect(types).toContain('instrumental')
    const inst = firstColumn.find((b: any) => b.type === 'instrumental')
    expect(inst?.instrumental?.chords).toEqual(['Em', 'D', 'Am7', 'Bm7'])
    expect(inst?.instrumental?.repeat).toBe(2)
  })
})
