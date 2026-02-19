import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { planSingleSong } from '../utils/pdf_mvp/index.js'
import { parseChordProOrLegacy } from '../utils/chordpro/parser'

function songFromChordproText(text){
  const doc = parseChordProOrLegacy(text)
  const blocks = (doc.sections || []).map(sec => ({
    section: sec.label,
    lines: (sec.lines || []).map(ln => ({
      plain: ln.comment || ln.lyrics || '',
      chordPositions: ln.chords || [],
      comment: ln.comment ? ln.comment : undefined
    }))
  }))
  return { title: doc.meta?.title || 'Untitled', key: doc.meta?.key || '', lyricsBlocks: blocks }
}

function loadSong(rel){
  const full = path.join(process.cwd(), rel)
  const txt = readFileSync(full, 'utf8')
  return songFromChordproText(txt)
}

describe('MVP PDF planner', () => {
  it('chooses two columns for the candidate song when appropriate', async () => {
    const song = loadSong('src/__tests__/fixtures/chordpro/test_two_column_candidate.chordpro')
    const { summary } = await planSingleSong(song)
    expect(summary.pages).toBe(1)
    expect(summary.columns).toBe(2)
    expect(summary.size).toBeGreaterThanOrEqual(12)
    expect(summary.size).toBeLessThanOrEqual(16)
  })

  it('handles midwrap two-column case on a single page', async () => {
    const song = loadSong('src/__tests__/fixtures/chordpro/test_two_column_midwrap.chordpro')
    const { summary } = await planSingleSong(song)
    expect(summary.pages).toBe(1)
    expect([1,2]).toContain(summary.columns)
    expect(summary.size).toBeGreaterThanOrEqual(12)
  })

  it('falls back to multi-page without splitting sections', async () => {
    const song = loadSong('src/__tests__/fixtures/chordpro/test_multi_page_forced.chordpro')
    const { summary } = await planSingleSong(song)
    expect(summary.pages).toBeGreaterThan(1)
    expect(summary.columns).toBe(1)
  })

  it('dense trailing chords still yields a clean single page', async () => {
    const song = loadSong('src/__tests__/fixtures/chordpro/test_trailing_chords_dense_v2.chordpro')
    const { summary } = await planSingleSong(song)
    expect(summary.pages).toBe(1)
    expect(summary.columns).toBe(1)
    expect(summary.size).toBeGreaterThanOrEqual(12)
  })

  it('plans songs with Turkish letters (including uppercase dotted/dotless I)', async () => {
    const song = {
      title: 'Rab Bizi Gönder',
      key: 'A',
      lyricsBlocks: [
        {
          section: 'Verse',
          lines: [
            { plain: 'ıüşiçöğ IÜŞİÇÖĞ', chordPositions: [{ sym: 'A', index: 0 }] },
            { plain: 'Bizi İsa için gönder', chordPositions: [{ sym: 'D', index: 0 }] },
          ],
        },
      ],
    }
    const { summary } = await planSingleSong(song)
    expect(summary.pages).toBe(1)
    expect(summary.columns).toBe(1)
    expect(summary.size).toBeGreaterThanOrEqual(12)
  })
})
