import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetReaderSettingsForTest,
  READER_PT_MAX,
  READER_PT_MIN,
  defaultReaderSettings,
  getReaderSettings,
  hydrateReaderSettings,
  parseReaderSettings,
  readerFontSize,
  readerLineHeight,
  setReaderSettings,
  verseNumberFontSize,
  verseNumberLift,
} from '../readerSettings'
import type { KVStorage } from '../defaults'

function memoryStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed))
  const store: KVStorage & { writes: string[] } = {
    writes: [],
    async getItem(key) {
      return data.has(key) ? (data.get(key) as string) : null
    },
    async setItem(key, value) {
      store.writes.push(key)
      data.set(key, value)
    },
    async removeItem(key) {
      data.delete(key)
    },
  }
  return store
}

const KEY = 'gc.reader.settings.v1'

beforeEach(() => {
  __resetReaderSettingsForTest()
})

describe('parseReaderSettings', () => {
  it('falls back to the defaults for a missing or unusable payload', () => {
    expect(parseReaderSettings(null)).toStrictEqual(defaultReaderSettings)
    expect(parseReaderSettings('')).toStrictEqual(defaultReaderSettings)
    expect(parseReaderSettings('{ not json')).toStrictEqual(defaultReaderSettings)
    expect(parseReaderSettings('"a string"')).toStrictEqual(defaultReaderSettings)
    expect(parseReaderSettings('null')).toStrictEqual(defaultReaderSettings)
  })

  it('keeps the good fields of a partially bad record', () => {
    const parsed = parseReaderSettings(
      JSON.stringify({ pt: 20, typeface: 'cursive', layout: 'prose', lineSpacing: 7 }),
    )
    expect(parsed).toStrictEqual({
      pt: 20,
      typeface: defaultReaderSettings.typeface,
      layout: 'prose',
      lineSpacing: defaultReaderSettings.lineSpacing,
    })
  })

  it('clamps the point size into the stepper range', () => {
    expect(parseReaderSettings(JSON.stringify({ pt: 400 })).pt).toBe(READER_PT_MAX)
    expect(parseReaderSettings(JSON.stringify({ pt: -3 })).pt).toBe(READER_PT_MIN)
    expect(parseReaderSettings(JSON.stringify({ pt: 'big' })).pt).toBe(defaultReaderSettings.pt)
  })
})

describe('reader settings store', () => {
  it('restores a stored choice, so the reader reopens the way it was left', async () => {
    const store = memoryStorage({
      [KEY]: JSON.stringify({ pt: 18, typeface: 'sans', layout: 'prose', lineSpacing: 'relaxed' }),
    })
    await hydrateReaderSettings(store)
    expect(getReaderSettings()).toStrictEqual({
      pt: 18,
      typeface: 'sans',
      layout: 'prose',
      lineSpacing: 'relaxed',
    })
  })

  it('writes through, and a fresh hydrate reads the change back', async () => {
    const store = memoryStorage()
    await hydrateReaderSettings(store)
    setReaderSettings({ ...defaultReaderSettings, pt: 16, layout: 'prose' })

    __resetReaderSettingsForTest()
    await hydrateReaderSettings(store)
    expect(getReaderSettings()).toStrictEqual({
      ...defaultReaderSettings,
      pt: 16,
      layout: 'prose',
    })
  })

  it('skips the write when nothing actually changed', async () => {
    const store = memoryStorage()
    await hydrateReaderSettings(store)
    setReaderSettings({ ...defaultReaderSettings })
    expect(store.writes).toStrictEqual([])
  })

  it('survives a rejecting read with the defaults intact', async () => {
    const store: KVStorage = {
      async getItem() {
        throw new Error('read failed')
      },
      async setItem() {},
      async removeItem() {},
    }
    await expect(hydrateReaderSettings(store)).resolves.toStrictEqual(defaultReaderSettings)
    expect(getReaderSettings()).toStrictEqual(defaultReaderSettings)
  })
})

describe('reading metrics', () => {
  it('derives font size and line height from the point size', () => {
    expect(readerFontSize(12)).toBe(16)
    expect(readerFontSize(24)).toBe(32)
    expect(readerLineHeight(12, 'tight')).toBe(22)
    expect(readerLineHeight(12, 'normal')).toBe(26)
    expect(readerLineHeight(12, 'relaxed')).toBe(30)
  })

  it('sets verse numerals smaller than the body text at every size', () => {
    for (let pt = READER_PT_MIN; pt <= READER_PT_MAX; pt += 1) {
      const fontSize = readerFontSize(pt)
      expect(verseNumberFontSize(fontSize)).toBeLessThan(fontSize)
      expect(verseNumberFontSize(fontSize)).toBeGreaterThan(0)
    }
  })

  it('keeps the numeral box shorter than the line ascent, so lines stay even', () => {
    // The numeral rides in an inline box whose height is its own text height
    // plus the lift (see VerseNumber.tsx). If that box were taller than the
    // space the line already has above the baseline, lines carrying a verse
    // number would grow and the paragraph would look ragged. `1.2` is a
    // generous stand-in for the numeral's font line height; the ascent estimate
    // is deliberately conservative (half the leading, plus a 0.9em ascender).
    for (let pt = READER_PT_MIN; pt <= READER_PT_MAX; pt += 1) {
      const fontSize = readerFontSize(pt)
      for (const spacing of ['tight', 'normal', 'relaxed'] as const) {
        const lineHeight = readerLineHeight(pt, spacing)
        const boxHeight = verseNumberFontSize(fontSize) * 1.2 + verseNumberLift(fontSize)
        const ascent = (lineHeight - fontSize * 1.2) / 2 + fontSize * 0.9
        expect(boxHeight).toBeLessThan(ascent)
      }
    }
  })
})
