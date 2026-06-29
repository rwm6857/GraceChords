import { describe, expect, test } from 'vitest'
import { buildChordRowsLayout, splitTextRowsByWidth } from '../chordLineLayout'

function monoMeasure(widthPerChar = 10){
  return (text = '') => String(text || '').length * widthPerChar
}

describe('chordLineLayout', () => {
  test('splits long lyric lines into wrapped rows', () => {
    const rows = splitTextRowsByWidth('Bless the Lord O my soul', 90, monoMeasure(10))
    expect(rows.length).toBeGreaterThan(1)
    expect(rows.map((r) => r.text).join(' ')).toContain('Bless')
  })

  test('keeps chord offsets inside row width across wrapped rows', () => {
    const plain = 'Bless the Lord O my soul and worship His holy name'
    const chords = [
      { sym: 'C', index: 0 },
      { sym: 'G', index: 10 },
      { sym: 'D/F#', index: 22 },
      { sym: 'Em', index: 35 },
      { sym: 'Gsus', index: 46 },
    ]
    const rowWidth = 120
    const measureLyric = monoMeasure(8)
    const measureChord = monoMeasure(9)

    const rows = buildChordRowsLayout({
      plain,
      chords,
      width: rowWidth,
      measureLyric,
      measureChord,
      transposeSym: (sym) => sym,
      spaceWidth: measureLyric(' '),
    })

    expect(rows.length).toBeGreaterThan(1)
    for (const row of rows) {
      for (const chord of row.offsets) {
        expect(chord.left).toBeGreaterThanOrEqual(0)
        const chordWidth = measureChord(chord.sym)
        expect(chord.left + chordWidth).toBeLessThanOrEqual(rowWidth)
      }
    }
  })
})
