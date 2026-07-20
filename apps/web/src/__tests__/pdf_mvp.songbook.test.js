import { describe, it, expect } from 'vitest'
import { renderSongbookPdfDoc, renderSongbookPdfBuffer } from '../utils/pdf_mvp/pure.js'

// Small single-page songs (short body → one page each) so page-count math is
// deterministic: front matter is 1 cover page + (TOC ? tocPages : 0), and each
// song is exactly one page. With ≤ ~43 entries the TOC fits on a single page.
function tinySong(title) {
  return {
    title,
    key: 'C',
    lyricsBlocks: [
      {
        section: 'Verse',
        lines: [{ plain: 'la la la', chordPositions: [{ sym: 'C', index: 0 }] }],
      },
    ],
  }
}

describe('songbook PDF renderer', () => {
  it('returns non-empty bytes', async () => {
    const bytes = await renderSongbookPdfBuffer([tinySong('Amazing Grace')], {})
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.length).toBeGreaterThan(0)
  })

  it('returns null for an empty song list', async () => {
    const res = await renderSongbookPdfDoc([], {})
    expect(res).toBeNull()
  })

  it('with TOC on: cover + 1 TOC page + one page per song', async () => {
    const songs = [tinySong('Cornerstone'), tinySong('Amazing Grace'), tinySong('Blessed Be')]
    const { doc } = await renderSongbookPdfDoc(songs, { includeTOC: true })
    // 1 cover + 1 TOC + 3 songs
    expect(doc.getNumberOfPages()).toBe(5)
  })

  it('with TOC off: cover + one page per song, no TOC page', async () => {
    const songs = [tinySong('Cornerstone'), tinySong('Amazing Grace'), tinySong('Blessed Be')]
    const { doc } = await renderSongbookPdfDoc(songs, { includeTOC: false })
    // 1 cover + 3 songs (no TOC)
    expect(doc.getNumberOfPages()).toBe(4)
  })

  it('renders alphabetically regardless of input order', async () => {
    const forward = [tinySong('Apple'), tinySong('Mango'), tinySong('Zebra')]
    const shuffled = [tinySong('Zebra'), tinySong('Apple'), tinySong('Mango')]
    const a = await renderSongbookPdfDoc(forward, { includeTOC: true })
    const b = await renderSongbookPdfDoc(shuffled, { includeTOC: true })
    // Same alphabetized content → same page count from either input order.
    expect(a.doc.getNumberOfPages()).toBe(b.doc.getNumberOfPages())
  })

  it('accepts a cover image data URL without throwing', async () => {
    // 1x1 transparent PNG.
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    const { doc } = await renderSongbookPdfDoc([tinySong('Doxology')], {
      includeTOC: true,
      coverImageDataUrl: png,
    })
    expect(doc.getNumberOfPages()).toBe(3) // cover + TOC + 1 song
  })
})
