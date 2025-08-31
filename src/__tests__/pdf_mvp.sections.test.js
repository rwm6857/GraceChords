import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { planSingleSong, __test } from '../utils/pdf_mvp/index.js'
import { parseChordProOrLegacy } from '../utils/chordpro/parser'

function songFromChordpro(rel){
  const full = path.join(process.cwd(), rel)
  const txt = readFileSync(full, 'utf8')
  const doc = parseChordProOrLegacy(txt)
  const blocks = (doc.sections || []).map(sec => ({
    section: sec.label,
    lines: (sec.lines || []).map(ln => ({ plain: ln.comment || ln.lyrics || '', chordPositions: ln.chords || [], comment: ln.comment ? ln.comment : undefined }))
  }))
  return { title: doc.meta?.title || 'Untitled', key: doc.meta?.key || '', lyricsBlocks: blocks, sectionCount: (doc.sections || []).length }
}

describe('MVP section integrity and header spacing', () => {
  it('never splits a section across columns/pages', async () => {
    const song = songFromChordpro('src/__tests__/fixtures/chordpro/test_two_column_many_sections.chordpro')
    const { plan } = await planSingleSong(song)
    const seen = new Set()
    for (const page of plan.pages) {
      for (const col of page.columns) {
        for (const idx of col) {
          expect(seen.has(idx)).toBe(false) // section index appears only once overall
          seen.add(idx)
        }
      }
    }
    expect(seen.size).toBe(song.sectionCount)
  })

  it('reserves a clear gap between key and first section', async () => {
    const title = 'A Long Title That Might Wrap'
    const key = 'G'
    const bodyPt = 16
    const { height, offset } = __test.headerHeights(title, key, bodyPt)
    expect(offset).toBeGreaterThan(height)
    // At least ~one body line of space
    expect(offset - height).toBeGreaterThanOrEqual(bodyPt * 1.1 - 0.5)
  })
})
