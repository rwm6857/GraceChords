import { describe, expect, it } from 'vitest'
import { classifyLine } from '../utils/classify.js'

describe('classifyLine', () => {
  it('detects heading', () => {
    expect(classifyLine('Verse 1')).toBe('heading')
  })

  it('detects chord lines', () => {
    expect(classifyLine('C G Am F')).toBe('chords')
  })

  it('detects lyrics', () => {
    expect(classifyLine('Amazing grace how sweet the sound')).toBe('lyrics')
  })
})
