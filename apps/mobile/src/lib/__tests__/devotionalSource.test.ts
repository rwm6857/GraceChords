import { beforeEach, describe, expect, it, vi } from 'vitest'
import { devotionalDayKey } from '@gracechords/core/devotional/dayKey'
import {
  parseManifest,
  parseMonthFile,
  shouldCheck,
  staleMonths,
  withCachedMonth,
  withCheckedAt,
} from '@gracechords/core/devotional/manifest'
import { selectDay } from '@gracechords/core/devotional/selection'
import type { Manifest, MonthFile } from '@gracechords/core/devotional/types'
import { manifestRelPath, manifestUrl, monthRelPath, monthUrl, tmpRelPath } from '../devotionals/paths'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

// There is no bundled content, so these tests exercise the shipped ARTIFACTS
// against the shared logic that reads them, plus the sync planning rules. The
// filesystem and network layers are thin wrappers over expo-file-system and
// fetch and are verified on device, not here.

const DIST = join(__dirname, '../../../../../analysis/out/dist')
const readDist = (rel: string) => readFileSync(join(DIST, rel), 'utf8')

describe('shipped artifacts', () => {
  const manifestText = readDist('manifest.json')
  const manifest = parseManifest(JSON.parse(manifestText) as unknown)

  it('has a manifest the client accepts', () => {
    expect(manifest).not.toBeNull()
    expect(manifest!.schemaVersion).toBe(1)
    expect(manifest!.contentVersion).toMatch(/^[0-9a-f]{16}$/)
    expect(Object.keys(manifest!.months)).toHaveLength(12)
    // Deterministic build: no timestamp, so a rebuild of unchanged content
    // produces an identical manifest and triggers no downloads.
    expect(manifest!.generatedAt).toBeNull()
  })

  it('carries a hash per month, not one global hash', () => {
    const hashes = Object.values(manifest!.months).map((m) => m.hash)
    expect(new Set(hashes).size).toBe(12)
  })

  it('every month file matches its manifest hash exactly', () => {
    // This is the check the device performs before accepting a download. If the
    // exporter and this comparison ever disagree, every sync would be rejected.
    for (const [key, entry] of Object.entries(manifest!.months)) {
      const text = readDist(`month/${key}.json`)
      expect(createHash('sha256').update(text).digest('hex'), `month ${key}`).toBe(entry.hash)
      expect(Buffer.byteLength(text, 'utf8')).toBe(entry.bytes)
    }
  })

  it('embeds the content version in every month path, so remote objects are immutable', () => {
    for (const [key, entry] of Object.entries(manifest!.months)) {
      expect(entry.file).toBe(`${manifest!.contentVersion}/month/${key}.json`)
    }
  })

  it('parses every month, covering all 365 day keys with no 02-29', () => {
    let days = 0
    for (let m = 1; m <= 12; m += 1) {
      const key = String(m).padStart(2, '0')
      const month = parseMonthFile(JSON.parse(readDist(`month/${key}.json`)) as unknown)
      expect(month, `month ${key}`).not.toBeNull()
      expect(month!.month).toBe(m)
      days += Object.keys(month!.days).length
    }
    expect(days).toBe(365)
    const feb = parseMonthFile(JSON.parse(readDist('month/02.json')) as unknown)!
    expect(feb.days['02-29']).toBeUndefined()
  })

  it('resolves every day of a leap year, with 02-29 repeating 02-28', () => {
    const months = new Map<string, MonthFile>()
    for (let m = 1; m <= 12; m += 1) {
      const key = String(m).padStart(2, '0')
      months.set(key, parseMonthFile(JSON.parse(readDist(`month/${key}.json`)) as unknown)!)
    }
    const d = new Date(2028, 0, 1)
    let open = 0
    let checked = 0
    while (d.getFullYear() === 2028) {
      const dayKey = devotionalDayKey(d)
      const day = selectDay(months.get(dayKey.slice(0, 2)), dayKey)
      expect(day, d.toDateString()).not.toBeNull()
      expect(day!.readings.length).toBeGreaterThan(0)
      if (day!.state === 'open') open += 1
      checked += 1
      d.setDate(d.getDate() + 1)
    }
    expect(checked).toBe(366)
    // 366 days over 365 keys: the leap day repeats 02-28, so its open-ness is
    // counted twice when 02-28 is itself open. It is not, hence 37.
    expect(open).toBe(37)
    expect(selectDay(months.get('02'), devotionalDayKey(new Date(2028, 1, 29))))
      .toEqual(selectDay(months.get('02'), '02-28'))
  })

  it('precomputes everything the client would otherwise derive', () => {
    const jan = parseMonthFile(JSON.parse(readDist('month/01.json')) as unknown)!
    const day = jan.days['01-01']
    expect(day.state).toBe('two')
    for (const dev of day.devotionals) {
      expect(dev.slug).toMatch(/^[a-z0-9-]+$/)
      expect(dev.excerpt.length).toBeGreaterThan(0)
      expect(dev.author).toBeTruthy()
      expect(dev.sourceWork).toBeTruthy()
      expect(dev.bodyBlocks.length).toBeGreaterThan(0)
      // No markup may reach the renderer — it ships no parser.
      expect(JSON.stringify(dev.bodyBlocks)).not.toContain('_')
    }
    expect(new Set(day.devotionals.map((x) => x.slug)).size).toBe(day.devotionals.length)
  })

  it('only ever emits the two block types the renderer knows', () => {
    const types = new Set<string>()
    for (let m = 1; m <= 12; m += 1) {
      const month = parseMonthFile(JSON.parse(readDist(`month/${String(m).padStart(2, '0')}.json`)) as unknown)!
      for (const day of Object.values(month.days)) {
        for (const dev of day.devotionals) for (const b of dev.bodyBlocks) types.add(b.type)
      }
    }
    expect([...types].sort()).toEqual(['p', 'verse'])
  })
})

describe('paths', () => {
  it('keeps the cache document-relative with a temp sibling', () => {
    expect(manifestRelPath()).toBe('devotionals/manifest.json')
    expect(monthRelPath('07')).toBe('devotionals/month/07.json')
    expect(tmpRelPath('07.json')).toBe('.devotionals-tmp/07.json')
  })

  it('builds remote URLs under the devotionals prefix', () => {
    expect(manifestUrl('https://cdn.test')).toBe('https://cdn.test/devotionals/manifest.json')
    expect(monthUrl('https://cdn.test', 'abc123/month/07.json'))
      .toBe('https://cdn.test/devotionals/abc123/month/07.json')
  })
})

describe('sync planning', () => {
  const manifest: Manifest = {
    schemaVersion: 1,
    contentVersion: 'v1',
    generatedAt: null,
    months: {
      '01': { file: 'v1/month/01.json', hash: 'h1', bytes: 10 },
      '02': { file: 'v1/month/02.json', hash: 'h2', bytes: 20 },
    },
  }

  it('fetches only the months whose hash changed', () => {
    expect(staleMonths(manifest, { lastCheckedAt: 0, hashes: {} })).toEqual(['01', '02'])
    expect(staleMonths(manifest, { lastCheckedAt: 0, hashes: { '01': 'h1' } })).toEqual(['02'])
    expect(staleMonths(manifest, { lastCheckedAt: 0, hashes: { '01': 'h1', '02': 'h2' } })).toEqual([])
    // One edited entry must cost one month, not twelve.
    expect(staleMonths(manifest, { lastCheckedAt: 0, hashes: { '01': 'old', '02': 'h2' } })).toEqual(['01'])
  })

  it('checks at most daily, and survives a backwards clock', () => {
    const now = 1_700_000_000_000
    const day = 24 * 60 * 60 * 1000
    expect(shouldCheck({ lastCheckedAt: now - 1000, hashes: {} }, now)).toBe(false)
    expect(shouldCheck({ lastCheckedAt: now - day, hashes: {} }, now)).toBe(true)
    expect(shouldCheck({ lastCheckedAt: now + day, hashes: {} }, now)).toBe(true)
  })

  it('records progress per month, so a partial sync resumes', () => {
    let state = { lastCheckedAt: 0, hashes: {} as Record<string, string> }
    state = withCheckedAt(state, 5)
    state = withCachedMonth(state, '01', 'h1')
    // '02' failed this run; the next run retries only it.
    expect(staleMonths(manifest, state)).toEqual(['02'])
    expect(state.lastCheckedAt).toBe(5)
  })
})
