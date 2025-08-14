import { describe, it, expect } from 'vitest'
import { getLayoutMetrics } from '../utils/pdf/pdfLayout'

const mkLines = (n) => Array.from({ length: n }, (_, i) => ({ plain: `line ${i+1}`, chordPositions: [] }))
const mkSection = (label, n) => ({ section: label, lines: mkLines(n) })

describe('widow/orphan handling in PDF layout', () => {
  it('exact-fit splits without widows or orphans', () => {
    const song = { title: 'Exact', key: 'C', lyricsBlocks: [mkSection('V', 62)] }
    const m = getLayoutMetrics(song, { columns: 1, lyricSizePt: 16, chordSizePt: 16 })
    expect(m.length).toBe(2)
    expect(m[0].cols[0].blocks.filter(b => b.t === 'line').length).toBe(31)
    expect(m[1].cols[0].blocks.filter(b => b.t === 'line').length).toBe(31)
  })

  it('avoids single-line widows at page end', () => {
    const blockA = { lines: mkLines(30) }
    const blockB = mkSection('Big', 40)
    const song = { title: 'Widow', key: 'C', lyricsBlocks: [blockA, blockB] }
    const m = getLayoutMetrics(song, { columns: 1, lyricSizePt: 16, chordSizePt: 16 })
    expect(m[0].cols[0].blocks.filter(b => b.t === 'line').length).toBe(30)
    const secondPageLines = m[1].cols[0].blocks.filter(b => b.t === 'line').length
    expect(secondPageLines).toBeGreaterThan(1)
  })

  it('moves lines to prevent orphan on next page', () => {
    const song = { title: 'Orphan', key: 'C', lyricsBlocks: [mkSection('V', 32)] }
    const m = getLayoutMetrics(song, { columns: 1, lyricSizePt: 16, chordSizePt: 16 })
    expect(m.length).toBe(2)
    expect(m[0].cols[0].blocks.filter(b => b.t === 'line').length).toBe(30)
    expect(m[1].cols[0].blocks.filter(b => b.t === 'line').length).toBe(2)
  })

  it('handles widows/orphans in multi-column layout', () => {
    const song = { title: 'Multi', key: 'C', lyricsBlocks: [mkSection('V', 32)] }
    const m = getLayoutMetrics(song, { columns: 2, lyricSizePt: 16, chordSizePt: 16 })
    const col1Lines = m[0].cols[0].blocks.filter(b => b.t === 'line').length
    const col2Lines = m[0].cols[1].blocks.filter(b => b.t === 'line').length
    expect(col1Lines).toBe(30)
    expect(col2Lines).toBe(2)
  })
})
