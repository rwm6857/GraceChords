import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { expandReading, expandReadings } from '../expandReadings'
import { normalizePlanReading } from '../planReading'

describe('expandReadings', () => {
  it('keeps numbered-book references like 1 Corinthians', () => {
    const passages = expandReading('1 Corinthians 9')
    expect(passages).toEqual([
      { bookNumber: 46, book: '1 Corinthians', chapter: 9, range: null },
    ])
  })

  it('returns all daily plan readings when one starts with a number', () => {
    const passages = expandReadings([
      'Exodus 5',
      'Luke 8',
      'Job 22',
      '1 Corinthians 9',
    ])
    expect(passages).toEqual([
      { bookNumber: 2, book: 'Exodus', chapter: 5, range: null },
      { bookNumber: 42, book: 'Luke', chapter: 8, range: null },
      { bookNumber: 18, book: 'Job', chapter: 22, range: null },
      { bookNumber: 46, book: '1 Corinthians', chapter: 9, range: null },
    ])
  })

  it('handles non-consecutive same-book chapter groups', () => {
    const passages = expandReading('Jeremiah 36&45')
    expect(passages).toEqual([
      { bookNumber: 24, book: 'Jeremiah', chapter: 36, range: null },
      { bookNumber: 24, book: 'Jeremiah', chapter: 45, range: null },
    ])
  })

  it('handles cross-chapter verse ranges', () => {
    const passages = expandReading('Isaiah 9:8-10:4')
    expect(passages).toEqual([
      { bookNumber: 23, book: 'Isaiah', chapter: 9, range: { start: 8, end: null } },
      { bookNumber: 23, book: 'Isaiah', chapter: 10, range: { start: 1, end: 4 } },
    ])
  })

  it('handles chapter spans and verse ranges', () => {
    expect(expandReading('Psalm 23-24')).toEqual([
      { bookNumber: 19, book: 'Psalms', chapter: 23, range: null },
      { bookNumber: 19, book: 'Psalms', chapter: 24, range: null },
    ])

    expect(expandReading('Psalm 119:121-144')).toEqual([
      { bookNumber: 19, book: 'Psalms', chapter: 119, range: { start: 121, end: 144 } },
    ])
  })

  it('expands structured numeric plan readings', () => {
    const passages = expandReading({ book: 24, ref: '36&45' })
    expect(passages).toEqual([
      { bookNumber: 24, book: 'Jeremiah', chapter: 36, range: null },
      { bookNumber: 24, book: 'Jeremiah', chapter: 45, range: null },
    ])
  })

  it('parses every reading in the mcheyne plan', () => {
    const plan = JSON.parse(
      readFileSync('src/features/readings/data/mcheyne.plan.json', 'utf8')
    ) as { mmdd: string, readings: (string | { book: number, ref: string })[] }[]

    for (const entry of plan){
      for (const reading of entry.readings){
        const normalized = normalizePlanReading(reading)
        expect(normalized, `failed normalization on ${entry.mmdd} ${String(reading)}`).not.toBeNull()
        expect(expandReading(reading), `failed on ${entry.mmdd} ${String(reading)}`).not.toEqual([])
      }
    }
  })
})
