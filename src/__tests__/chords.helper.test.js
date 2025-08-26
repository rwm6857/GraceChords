import { describe, it, expect } from 'vitest'
import { parseChordLine, resolveChordCollisions } from '../utils/chords.js'

const m = (s = '') => s.length

describe('parseChordLine', () => {
  it('extracts chords with measured positions', () => {
    const res = parseChordLine('[G]Hello [D]world', m, m)
    expect(res.lyrics).toBe('Hello world')
    expect(res.chords).toEqual([
      { sym: 'G', x: 0, w: 1 },
      { sym: 'D', x: 6, w: 1 }
    ])
  })
})

describe('resolveChordCollisions', () => {
  it('nudges overlapping chords to keep a space gap', () => {
    const res = parseChordLine('a[G]b[C]c', m, m)
    const [c1, c2] = res.chords
    expect(c2.x - (c1.x + c1.w)).toBeGreaterThanOrEqual(1)
    expect(c1.x).toBe(0)
    expect(c2.x).toBe(3)
  })

  it('spreads three stacked chords symmetrically', () => {
    const chords = [
      { sym: 'G', x: 0, w: 1 },
      { sym: 'C', x: 0, w: 1 },
      { sym: 'D', x: 0, w: 1 }
    ]
    resolveChordCollisions(chords, 1)
    const xs = chords.map(c => c.x)
    expect(xs).toEqual([-2, 0, 2])
    expect(chords[1].x - (chords[0].x + chords[0].w)).toBeGreaterThanOrEqual(1)
    expect(chords[2].x - (chords[1].x + chords[1].w)).toBeGreaterThanOrEqual(1)
  })
})

