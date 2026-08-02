import { describe, expect, it } from 'vitest'
import { expandReadings, getPlanForDate, passageId } from '@gracechords/core'
import { resolveInitialPassageIndex } from '../readerPassage'

// Regression: tapping any reading on the Daily Word landing used to push the
// Reader with no passage, so every row opened the day's FIRST chapter.
describe('resolveInitialPassageIndex', () => {
  // Aug 2 is the screenshot's day (Judges 16 · Acts 20 · Jeremiah 29 · Mark 15)
  // and a normal 4-reading date; every date in the plan is exercised below.
  const passages = expandReadings(getPlanForDate(new Date(2026, 7, 2)).readings)

  it('resolves each of the day’s readings to its own index', () => {
    expect(passages.length).toBeGreaterThan(1)
    passages.forEach((p, i) => {
      expect(resolveInitialPassageIndex(passages, passageId(p))).toBe(i)
    })
  })

  it('does not collapse later readings onto the first one', () => {
    const last = passages.length - 1
    expect(resolveInitialPassageIndex(passages, passageId(passages[last]))).not.toBe(0)
  })

  it('falls back to the first passage with no id or an unknown id', () => {
    expect(resolveInitialPassageIndex(passages, undefined)).toBe(0)
    expect(resolveInitialPassageIndex(passages, '')).toBe(0)
    expect(resolveInitialPassageIndex(passages, '99|999|all')).toBe(0)
    expect(resolveInitialPassageIndex([], passageId(passages[0]))).toBe(0)
  })

  // Every plan day must round-trip, not just the one above — a passageId that
  // isn't unique within a day would silently send two rows to one chapter.
  it('round-trips every reading on every day of the plan', () => {
    for (let day = 0; day < 365; day += 1) {
      const date = new Date(2026, 0, 1 + day)
      const list = expandReadings(getPlanForDate(date).readings)
      list.forEach((p, i) => {
        expect(resolveInitialPassageIndex(list, passageId(p))).toBe(i)
      })
    }
  })
})
