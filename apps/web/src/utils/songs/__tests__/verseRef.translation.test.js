import { describe, expect, it } from 'vitest'
import {
  makeVerseId,
  parseVerseId,
  parseVerseReference,
} from '../verseRef'

describe('verseRef translation support', () => {
  it('creates translation-aware verse ids', () => {
    expect(makeVerseId({ book: 'John', refKey: '3:16' })).toBe('v:esv|John 3:16')
    expect(makeVerseId({ book: 'John', refKey: '3:16', translation: 'KJV' })).toBe('v:kjv|John 3:16')
  })

  it('parses new translation-aware ids', () => {
    const parsed = parseVerseId('v:tr|John 3:16')
    expect(parsed?.translation).toBe('tr')
    expect(parsed?.refDisplay).toBe('John 3:16')
  })

  it('keeps backward compatibility for old ids', () => {
    const parsed = parseVerseId('v:John 3:16')
    expect(parsed?.translation).toBe('esv')
    expect(parsed?.id).toBe('v:esv|John 3:16')
  })

  it('includes selected translation when parsing verse input', () => {
    const parsed = parseVerseReference('John 3:16', { translation: 'KJV' })
    expect(parsed.error).toBeUndefined()
    expect(parsed.translation).toBe('kjv')
    expect(parsed.id).toBe('v:kjv|John 3:16')
  })

  it('parses chapter groups separated with ampersand', () => {
    const parsed = parseVerseReference('Jeremiah 36&45')
    expect(parsed.error).toBeUndefined()
    expect(parsed.segments).toEqual([
      { chapter: 36, ranges: null },
      { chapter: 45, ranges: null },
    ])
  })
})
