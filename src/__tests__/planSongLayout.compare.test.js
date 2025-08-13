import { describe, it, expect } from 'vitest'
import { planSongLayout } from '../utils/pdf-plan'
import { jsPDF } from 'jspdf'

describe('planSongLayout regression', () => {
  it('matches jsPDF plan with simple length-based measure', () => {
    const song = {
      title: 'Test',
      key: 'C',
      lyricsBlocks: [
        {
          section: 'Verse 1',
          lines: [
            { plain: 'short line', chordPositions: [{ index: 0, sym: 'C' }] },
            { plain: 'another line', chordPositions: [] }
          ]
        }
      ]
    }

    const doc = new jsPDF({ unit: 'pt', format: 'letter' })
    const makeLyricPdf = (pt) => (text) => {
      doc.setFont('Helvetica', 'normal')
      doc.setFontSize(pt)
      return doc.getTextWidth(text || '')
    }
    const makeChordPdf = (pt) => (text) => {
      doc.setFont('Courier', 'bold')
      doc.setFontSize(pt)
      return doc.getTextWidth(text || '')
    }
    const planPdf = planSongLayout(song, { lyricFamily: 'Helvetica', chordFamily: 'Courier' }, makeLyricPdf, makeChordPdf)

    const makeLyricSimple = (pt) => (text) => (text || '').length * pt * 0.5
    const makeChordSimple = (pt) => (text) => (text || '').length * pt * 0.5
    const planSimple = planSongLayout(song, { lyricFamily: 'Helvetica', chordFamily: 'Courier' }, makeLyricSimple, makeChordSimple)

    expect(planSimple).toEqual(planPdf)
  })
})
