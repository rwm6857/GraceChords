import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseChordPro } from '../utils/chordpro.js'
import { chooseBestLayout } from '../utils/pdf/pdfLayout'

// simple text width estimator
const makeMeasure = pt => text => (text ? text.length * (pt * 0.6) : 0)

describe('PDF layout content', () => {
  it('plans line blocks with lyrics and chords', () => {
    const songText = readFileSync(__dirname + '/fixtures/sample.chordpro', 'utf8')
    const parsed = parseChordPro(songText)
    const song = {
      title: parsed.meta.title,
      key: parsed.meta.key,
      lyricsBlocks: parsed.blocks.map(b => ({
        section: b.section,
        lines: b.lines.map(ln => ({
          plain: ln.text,
          chordPositions: ln.chords
        }))
      }))
    }

    const { plan } = chooseBestLayout(song, {}, makeMeasure, makeMeasure)
    const blocks = plan.layout.pages.flatMap(p => p.columns.flatMap(c => c.blocks))
    const lineBlock = blocks.find(b => b.type === 'line' && b.chords?.length)

    expect(lineBlock).toBeTruthy()
    expect(lineBlock.lyrics).toContain('line with')
    expect(lineBlock.chords[0]).toHaveProperty('sym')
  })
})
