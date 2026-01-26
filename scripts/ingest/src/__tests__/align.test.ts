import { describe, expect, it } from 'vitest'
import { alignChordLineToLyrics, snapLeftToWordBoundary } from '../utils/align.js'

describe('alignChordLineToLyrics', () => {
  it('inserts chords into lyric line', () => {
    const result = alignChordLineToLyrics('C     G', 'Amazing grace')
    expect(result.line).toContain('[C]')
    expect(result.line).toContain('[G]')
    expect(result.success).toBe(true)
  })

  it('allows mid-syllable insertions when aligned', () => {
    const result = alignChordLineToLyrics('      Bm7 ', 'Crucified,')
    expect(result.line).toContain('[Bm7]')
    expect(result.line.startsWith('[Bm7]')).toBe(false)
    expect(result.line.includes(',[Bm7]')).toBe(false)
  })
})

describe('snapLeftToWordBoundary', () => {
  it('snaps to word start at end punctuation', () => {
    const line = 'Crucified,'
    expect(snapLeftToWordBoundary(line, line.length)).toBe(0)
  })

  it('snaps inside word to word start', () => {
    expect(snapLeftToWordBoundary('Crucified', 6)).toBe(0)
  })

  it('snaps to next word start when between words', () => {
    expect(snapLeftToWordBoundary('You took the fall', 12)).toBe(13)
  })

  it('keeps mid-word index when allowed', () => {
    expect(snapLeftToWordBoundary('Crucified', 6, true)).toBe(6)
  })
})
