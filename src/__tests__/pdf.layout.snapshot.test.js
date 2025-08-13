import { describe, it, expect } from 'vitest'
import { getLayoutMetrics, computeLayout } from '../utils/pdf-plan'

// ---------- Fixtures ----------

function mkLine(text, chordIdxsSyms) {
  return {
    plain: text,
    chordPositions: chordIdxsSyms.map(([index, sym]) => ({ index, sym }))
  }
}

function mkBlock(section, lines) {
  return { section, lines }
}

function mkSong({ title='Test Song', key='C', verses=3, linesPerVerse=8, lineText='This is a lyric line', withChords=true }) {
  const blocks = []
  for (let v = 1; v <= verses; v++) {
    const lines = []
    for (let i = 0; i < linesPerVerse; i++) {
      const lyric = `${lineText} ${v}.${i+1}`
      // put a couple chords in each line at stable offsets
      const chords = withChords
        ? [
            [Math.max(0, Math.floor(lyric.length * 0.15)), 'G'],
            [Math.max(0, Math.floor(lyric.length * 0.55)), 'D'],
            [Math.max(0, Math.floor(lyric.length * 0.85)), 'Em']
          ]
        : []
      lines.push(mkLine(lyric, chords))
    }
    blocks.push(mkBlock(`VERSE ${v}`, lines))
  }
  return { title, key, lyricsBlocks: blocks }
}

function transposeSymbols(song, mapper) {
  return {
    ...song,
    lyricsBlocks: song.lyricsBlocks.map(b => ({
      section: b.section,
      lines: b.lines.map(ln => ({
        plain: ln.plain,
        chordPositions: (ln.chordPositions || []).map(c => ({ index: c.index, sym: mapper(c.sym) }))
      }))
    }))
  }
}

// ---------- Tests ----------

describe('PDF layout engine v2 (two-pass, no orphan headers)', () => {
  it('never orphans a section header at the bottom of a column', () => {
    const longSong = mkSong({ verses: 4, linesPerVerse: 10 })
    const metrics = getLayoutMetrics(longSong, { columns: 2, lyricSizePt: 16, chordSizePt: 16 })

    // For every column, ensure a 'section' is never the last block
    for (const page of metrics) {
      for (const col of page.cols) {
        const blocks = col.blocks
        if (!blocks.length) continue
        const last = blocks[blocks.length - 1]
        expect(last.t === 'section').toBe(false)
      }
    }
  })

  it('maintains chord X offsets when chord symbols change (transpose scenario)', () => {
    const song = mkSong({ verses: 1, linesPerVerse: 2 })
    const transposed = transposeSymbols(song, s => {
      // simple rename map (doesn’t change indices)
      if (s === 'G') return 'A'
      if (s === 'D') return 'E'
      if (s === 'Em') return 'F#m'
      return s
    })

    const m1 = getLayoutMetrics(song,       { columns: 1, lyricSizePt: 16, chordSizePt: 16 })
    const m2 = getLayoutMetrics(transposed, { columns: 1, lyricSizePt: 16, chordSizePt: 16 })

    // Compare chord x arrays line-by-line (symbols can differ; x should be identical)
    const xs1 = m1.flatMap(p => p.cols.flatMap(c => c.blocks.filter(b => b.t === 'line').flatMap(b => b.line.chords.map(ch => ch.x))))
    const xs2 = m2.flatMap(p => p.cols.flatMap(c => c.blocks.filter(b => b.t === 'line').flatMap(b => b.line.chords.map(ch => ch.x))))
    expect(xs1).toEqual(xs2)
  })

  it('a long song can fit into one page with 2 columns at default 16pt (or smaller if needed)', () => {
    // This should be long enough to need two columns, but still 1 page at 16pt/2-col.
    const longOnePager = mkSong({ verses: 3, linesPerVerse: 10 })
    // First try 1 column (likely >1 page), then 2 columns
    let pages1 = getLayoutMetrics(longOnePager, { columns: 1, lyricSizePt: 16, chordSizePt: 16 }).length
    let pages2 = getLayoutMetrics(longOnePager, { columns: 2, lyricSizePt: 16, chordSizePt: 16 }).length

    if (pages2 > 1) {
      // If your environment measurer makes it spill, assert that 12pt/2-col fits
      pages2 = getLayoutMetrics(longOnePager, { columns: 2, lyricSizePt: 12, chordSizePt: 12 }).length
      expect(pages2).toBeLessThanOrEqual(1)
    } else {
      // Ideal case: 2 columns already fits at 16pt
      expect(pages2).toBe(1)
    }

    // Sanity check that 1 column was worse or equal
    expect(pages1).toBeGreaterThanOrEqual(pages2)
  })

  it('a huge song still spills past 1 page at 12pt with 2 columns (worst case allowed)', () => {
    // Intentionally extreme: should exceed one page even at min size / 2 columns
    const huge = mkSong({ verses: 10, linesPerVerse: 12 })
    const pages = getLayoutMetrics(huge, { columns: 2, lyricSizePt: 12, chordSizePt: 12 }).length
    expect(pages).toBeGreaterThan(1)
  })
})
