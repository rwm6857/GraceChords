import { describe, it, expect } from 'vitest'
import { chooseBestLayout, normalizeSongInput } from '../pdf/pdfLayout'
import { planSongForJpg } from '../image'

function makeMockCanvasFactory() {
  return function createCanvas(width = 1, height = 1) {
    const ctx = {
      fillStyle: '#000',
      font: '',
      fillRect: () => {},
      scale: () => {},
      fillText: () => {},
      measureText(text = '') {
        const m = String(this.font || '').match(/(\d+(?:\.\d+)?)px/)
        const pt = m ? Number(m[1]) : 16
        return { width: String(text || '').length * pt * 0.52 }
      },
    }
    return {
      width,
      height,
      getContext: () => ctx,
    }
  }
}

describe('planSongForJpg', () => {
  it('uses PDF-style wrapping fit and avoids false multi-page blocking', () => {
    const createCanvas = makeMockCanvasFactory()
    const measureCtx = createCanvas(1, 1).getContext('2d')
    const makeLyric = (pt) => (text) => {
      measureCtx.font = `${pt}px NotoSans`
      return measureCtx.measureText(text || '').width
    }
    const makeChord = (pt) => (text) => {
      measureCtx.font = `bold ${pt}px NotoSansMono`
      return measureCtx.measureText(text || '').width
    }

    const longLine = 'Creation is awaiting the return of the Lord and the nations are awaiting the coming of the King in glory and majesty forever'
    const song = normalizeSongInput({
      title: 'Creation is Awaiting',
      key: 'A',
      lyricsBlocks: [
        {
          section: 'VERSE 1',
          lines: Array.from({ length: 8 }, () => ({ plain: longLine, chordPositions: [] })),
        },
      ],
    })

    const legacy = chooseBestLayout(
      song,
      { lyricFamily: 'NotoSans', chordFamily: 'NotoSansMono' },
      makeLyric,
      makeChord
    )
    expect(legacy.plan.layout.pages.length).toBeGreaterThan(1)

    const planned = planSongForJpg(song, {
      createCanvas,
      lyricFamily: 'NotoSans',
      chordFamily: 'NotoSansMono',
    })
    expect(planned.error).toBeUndefined()
    expect(planned.summary.pages).toBe(1)
    expect(planned.plan.layout.pages.length).toBe(1)
  })
})
