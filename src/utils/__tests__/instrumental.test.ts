import { describe, it, expect } from 'vitest'
import { transposeInstrumental, formatInstrumental, splitInstrumental } from '../instrumental.js'

describe('instrumental helpers', () => {
  it('transposes chord list and preserves repeat', () => {
    const inst = transposeInstrumental({ chords: ['D', 'A/C#'], repeat: 3 }, 2)
    expect(inst.chords).toEqual(['E', 'B/D#'])
    expect(inst.repeat).toBe(3)
  })

  it('formats single line when split disabled', () => {
    const rows = formatInstrumental({ chords: ['D', 'A', 'E'] }, { split: false })
    expect(rows).toEqual(['D  //  A  //  E'])
  })

  it('splits into balanced rows when split enabled and appends repeat suffix', () => {
    const rows = formatInstrumental({ chords: ['Em', 'D', 'Am7', 'Bm7'], repeat: 2 }, { split: true })
    expect(rows).toEqual(['Em  //  D', 'Am7  //  Bm7 x2'])
  })

  it('exposes splitInstrumental chord groups', () => {
    const groups = splitInstrumental({ chords: ['C', 'G', 'Am', 'F', 'G'] }, { split: true })
    expect(groups).toEqual([
      ['C', 'G', 'Am'],
      ['F', 'G'],
    ])
  })
})
