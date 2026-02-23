import { describe, expect, it } from 'vitest'
import { decodeSet, encodeSet } from '../setcode'
import { parseVerseReference } from '../../songs/verseRef'

describe('setcode verse translation support', () => {
  it('round-trips translation-aware verse ids', () => {
    const parsed = parseVerseReference('John 3:16', { translation: 'kjv' })
    const code = encodeSet([{ id: parsed.id, toKey: '' }])
    expect(code.startsWith('V_')).toBe(true)

    const decoded = decodeSet(code)
    expect(decoded.error).toBeUndefined()
    expect(decoded.entries).toEqual([{ id: 'v:kjv|John 3:16', toKey: '' }])
  })

  it('decodes legacy verse codes as ESV', () => {
    const legacy = `V${encodeLegacyVerse('John', '3:16')}`
    const decoded = decodeSet(legacy)
    expect(decoded.error).toBeUndefined()
    expect(decoded.entries).toEqual([{ id: 'v:esv|John 3:16', toKey: '' }])
  })
})

function encodeLegacyVerse(book, refKey){
  const encodedBook = encodeLegacyString(book)
  const encodedRef = encodeLegacyString(refKey.replace(/,/g, '~'))
  return `${toBase36(encodedBook.length, 2)}${encodedBook}${toBase36(encodedRef.length, 3)}${encodedRef}`
}

function encodeLegacyString(value){
  return String(value || '').replace(/-/g, '--').replace(/~/g, '-t').replace(/%/g, '-p')
}

function toBase36(num, width){
  return Number(num || 0).toString(36).toUpperCase().padStart(width, '0')
}
