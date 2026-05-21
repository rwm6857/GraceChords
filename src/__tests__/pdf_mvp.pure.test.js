import { describe, it, expect } from 'vitest'
import {
  renderSingleSongPdfBuffer,
  renderMultiSongPdfBuffer,
  planSingleSong,
} from '../utils/pdf_mvp/pure.js'

const SAMPLE = {
  title: 'Build My Life',
  key: 'G',
  sections: [
    {
      label: 'Verse 1',
      lines: [
        { plain: 'Worthy of every song we could ever sing', chords: [{ sym: 'G', index: 0 }, { sym: 'D', index: 11 }] },
        { plain: 'Worthy of all the praise we could ever bring', chords: [{ sym: 'C', index: 0 }] },
      ],
    },
    {
      label: 'Chorus',
      lines: [
        { plain: 'Holy, there is no one like You', chords: [{ sym: 'G', index: 0 }] },
      ],
    },
  ],
}

const MULTI_PAGE = {
  title: 'Long Song',
  key: 'A',
  sections: Array.from({ length: 30 }, (_, i) => ({
    label: `Verse ${i + 1}`,
    lines: [
      { plain: 'Line one of this verse goes here for a while to fill the page space', chords: [{ sym: 'A', index: 0 }] },
      { plain: 'Line two has even more content stretched out to push us over the edge', chords: [{ sym: 'D', index: 0 }, { sym: 'E', index: 30 }] },
      { plain: 'Line three brings the section to a close', chords: [{ sym: 'A', index: 0 }] },
    ],
  })),
}

function pdfMagic(bytes) {
  return String.fromCharCode(...bytes.subarray(0, 4))
}

describe('pdf_mvp pure renderer', () => {
  it('renders a single song to a valid PDF buffer', async () => {
    const buf = await renderSingleSongPdfBuffer(SAMPLE)
    expect(buf).toBeInstanceOf(Uint8Array)
    expect(buf.length).toBeGreaterThan(500)
    expect(pdfMagic(buf)).toBe('%PDF')
  })

  it('renders a multi-song setlist to a valid PDF buffer', async () => {
    const buf = await renderMultiSongPdfBuffer([SAMPLE, { ...SAMPLE, title: 'Other Song', key: 'A' }])
    expect(buf).toBeInstanceOf(Uint8Array)
    expect(buf.length).toBeGreaterThan(800)
    expect(pdfMagic(buf)).toBe('%PDF')
  })

  it('handles a multi-page song by extending to additional pages', async () => {
    const { summary } = await planSingleSong(MULTI_PAGE)
    expect(summary.pages).toBeGreaterThan(1)
    const buf = await renderSingleSongPdfBuffer(MULTI_PAGE)
    expect(buf.length).toBeGreaterThan(1000)
    expect(pdfMagic(buf)).toBe('%PDF')
  })
})
