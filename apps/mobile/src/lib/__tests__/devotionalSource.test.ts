import { describe, expect, it } from 'vitest'
import { devotionalDayKey } from '@gracechords/core/devotional/dayKey'
import { getPlanForDate } from '@gracechords/core/bible/plan'
import { readBundledMonth, readDay } from '../devotionals/source'
import { monthRelPath, tmpMonthRelPath } from '../devotionals/paths'

// Exercises the BUNDLED read path only — no filesystem, no network. That is the
// point: the path that renders the first frame must not touch either.

describe('bundled devotional read path', () => {
  it('loads all twelve months from the bundle', () => {
    for (let m = 1; m <= 12; m += 1) {
      const key = String(m).padStart(2, '0')
      const month = readBundledMonth(key)
      expect(month, `month ${key}`).not.toBeNull()
      expect(month!.month).toBe(m)
      expect(month!.schemaVersion).toBe(1)
    }
  })

  it('covers all 365 day keys and holds no 02-29', () => {
    let days = 0
    for (let m = 1; m <= 12; m += 1) {
      days += Object.keys(readBundledMonth(String(m).padStart(2, '0'))!.days).length
    }
    expect(days).toBe(365)
    expect(readBundledMonth('02')!.days['02-29']).toBeUndefined()
  })

  it('returns an entry for every day of the year, never undefined', () => {
    const d = new Date(2026, 0, 1)
    let open = 0
    let withContent = 0
    while (d.getFullYear() === 2026) {
      const day = readDay(devotionalDayKey(d))
      expect(day, d.toDateString()).not.toBeNull()
      if (day!.state === 'open') open += 1
      else withContent += 1
      expect(day!.readings.length).toBeGreaterThan(0)
      d.setDate(d.getDate() + 1)
    }
    expect(open).toBe(37)
    expect(withContent).toBe(328)
  })

  it('does not crash on a leap day, and repeats 02-28', () => {
    const leap = readDay(devotionalDayKey(new Date(2028, 1, 29)))
    const feb28 = readDay(devotionalDayKey(new Date(2028, 1, 28)))
    expect(leap).not.toBeNull()
    expect(leap).toEqual(feb28)
  })

  it('reports the same reading count as the plan for every day', () => {
    // The whole feature rests on the readings on screen and the devotional beside
    // them describing the same day.
    const d = new Date(2026, 0, 1)
    let devotionals = 0
    while (d.getFullYear() === 2026) {
      const day = readDay(devotionalDayKey(d))!
      expect(day.readings.length).toBe(getPlanForDate(d).readings.length)
      for (const dev of day.devotionals) {
        expect(dev.matchedChapter).toBeTruthy()
        devotionals += 1
      }
      d.setDate(d.getDate() + 1)
    }
    expect(devotionals).toBe(548)
  })

  it('precomputes everything the client would otherwise derive', () => {
    const day = readDay('01-01')!
    expect(day.state).toBe('two')
    for (const dev of day.devotionals) {
      expect(dev.slug).toMatch(/^[a-z0-9-]+$/)
      expect(dev.excerpt.length).toBeGreaterThan(0)
      expect(dev.author).toBe('C. H. Spurgeon')
      expect(dev.sourceWork).toBe('Morning and Evening')
      expect(dev.bodyBlocks.length).toBeGreaterThan(0)
      // No markup may reach the renderer.
      expect(JSON.stringify(dev.bodyBlocks)).not.toContain('_')
    }
    // Slugs unique within a day, so a route can address one unambiguously.
    expect(new Set(day.devotionals.map((x) => x.slug)).size).toBe(day.devotionals.length)
  })

  it('only ever emits the two block types the renderer knows', () => {
    const types = new Set<string>()
    for (let m = 1; m <= 12; m += 1) {
      for (const day of Object.values(readBundledMonth(String(m).padStart(2, '0'))!.days)) {
        for (const dev of day.devotionals) for (const b of dev.bodyBlocks) types.add(b.type)
      }
    }
    expect([...types].sort()).toEqual(['p', 'verse'])
  })

  it('keeps cache paths under a document-relative root with a temp sibling', () => {
    expect(monthRelPath('07')).toBe('devotionals/month/07.json')
    expect(tmpMonthRelPath('07')).toBe('.devotionals-tmp/07.json')
  })
})
