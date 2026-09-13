import { describe, expect, it } from 'vitest'
import { defaultSetlistName, formatSetDate } from '../setlistName'

// Sep 12 2026. Constructed locally so the month/day match the device's calendar
// rather than UTC's — a set made at 9pm must not be named with tomorrow's date.
const SEP_12 = new Date(2026, 8, 12)

const t = (key: string, opts: { date: string }) =>
  key === 'defaultName' ? `${opts.date} Worship` : key

describe('formatSetDate', () => {
  it('orders month/day per locale', () => {
    expect(formatSetDate(SEP_12, 'en-US')).toBe('9/12')
    // es puts the day first; the exact separator is the platform's business.
    expect(formatSetDate(SEP_12, 'es-ES').replace(/\s/g, '')).toMatch(/^12\/9$/)
  })

  it('falls back rather than throwing on a junk locale', () => {
    expect(() => formatSetDate(SEP_12, 'not-a-locale!!')).not.toThrow()
  })
})

describe('defaultSetlistName', () => {
  it('names the first set of the day cleanly', () => {
    expect(defaultSetlistName(t, 'en-US', [], SEP_12)).toBe('9/12 Worship')
  })

  it('numbers a second set made the same day', () => {
    expect(defaultSetlistName(t, 'en-US', ['9/12 Worship'], SEP_12)).toBe('9/12 Worship (2)')
    expect(
      defaultSetlistName(t, 'en-US', ['9/12 Worship', '9/12 Worship (2)'], SEP_12),
    ).toBe('9/12 Worship (3)')
  })

  it('does not number when the day is free, even with other sets around', () => {
    expect(defaultSetlistName(t, 'en-US', ['Youth', '9/5 Worship'], SEP_12)).toBe('9/12 Worship')
  })
})
