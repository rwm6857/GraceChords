import { describe, it, expect } from 'vitest'
import { normalizeSongInput } from '../utils/pdf/pdfLayout'

describe('normalizeSongInput lyricsBlocks', () => {
  it('converts lyricsBlocks into sections with lines and blocks', () => {
    const song = {
      title: 'Test',
      key: 'C',
      capo: 2,
      layoutHints: { requestedColumns: 2 },
      meta: { tempo: '120bpm' },
      lyricsBlocks: [
        {
          section: 'Verse',
          lines: [
            { plain: 'Line 1', chordPositions: [{ index: 0, sym: 'C' }] },
            { plain: 'Line 2', chordPositions: [], comment: 'Note' },
          ],
        },
      ],
    }

    const out = normalizeSongInput(song)

    expect(out.title).toBe('Test')
    expect(out.key).toBe('C')
    expect(out.capo).toBe(2)
    expect(out.layoutHints?.requestedColumns).toBe(2)
    expect(out.tempo).toBe('120bpm')
    expect(out.sections).toHaveLength(1)

    const sec = out.sections[0]
    expect(sec.label).toBe('Verse')
    expect(sec.lines).toHaveLength(2)
    expect(sec.blocks).toHaveLength(3)
    expect(sec.lines[0]).toEqual({
      lyrics: 'Line 1',
      chords: [{ index: 0, sym: 'C' }],
      comment: undefined,
    })
    expect(sec.lines[1]).toEqual({
      lyrics: 'Line 2',
      chords: [],
      comment: 'Note',
    })
    expect(sec.blocks[0]).toEqual({ type: 'section', header: 'Verse' })
    expect(sec.blocks[1]).toMatchObject({ type: 'line', lyrics: 'Line 1' })
    expect(sec.blocks[2]).toMatchObject({ type: 'line', comment: 'Note' })
  })
})

