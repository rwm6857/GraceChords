import { describe, it, expect } from 'vitest'
import { renderPlanToCanvas } from '../image'

describe('renderPlanToCanvas Turkish text support', () => {
  it('passes Turkish characters through title/lyrics rendering', () => {
    const drawn = []
    const ctx = {
      fillStyle: '#000',
      font: '',
      fillRect: () => {},
      scale: () => {},
      fillText: (text) => drawn.push(String(text)),
    }
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ctx,
    }

    const plan = {
      margin: 36,
      lyricSizePt: 16,
      chordSizePt: 16,
      lyricFamily: 'NotoSans',
      chordFamily: 'NotoSansMono',
      title: 'Rab Bizi Gönder',
      key: 'A',
      columns: 1,
      headerOffsetY: 0,
      layout: {
        pages: [
          {
            columns: [
              {
                x: 36,
                blocks: [
                  { type: 'section', header: 'Köprü' },
                  { type: 'line', lyrics: 'IĞDIR İÇİN ÖĞÜT', chords: [{ sym: 'A', x: 0 }] },
                  { type: 'line', lyrics: 'ıüşiçöğ IÜŞİÇÖĞ', chords: [] },
                ],
              },
            ],
          },
        ],
      },
    }

    renderPlanToCanvas(plan, {
      pxWidth: 1200,
      pxHeight: 1600,
      dpi: 150,
      createCanvas: () => canvas,
    })

    expect(drawn).toContain('Rab Bizi Gönder')
    expect(drawn).toContain('[Köprü]')
    expect(drawn).toContain('IĞDIR İÇİN ÖĞÜT')
    expect(drawn).toContain('ıüşiçöğ IÜŞİÇÖĞ')
  })
})
