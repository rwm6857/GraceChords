import { describe, it, expect } from 'vitest'
import { convertToCanonicalChordPro, suggestCanonicalFilename } from '../convert'
import { parseChordProOrLegacy } from '../parser'

const legacy = `
Verse 1
[A]Amazing [D]grace
Chorus
[A]My chains are [D]gone
`

describe('convertToCanonicalChordPro', () => {
  it('wraps sections with directives and preserves chords/lines', () => {
    const { text, docTitle } = convertToCanonicalChordPro(legacy, { country: 'USA', tags: ['hymn','slow'] })
    expect(text).toMatch(/\{start_of_verse/)
    expect(text).toMatch(/\{end_of_chorus\}/)
    const doc = parseChordProOrLegacy(text)
    expect(doc.sections.length).toBe(2)
    expect(doc.sections[0].lines[0].lyrics).toMatch(/Amazing grace/i)
    expect(doc.meta?.meta?.country).toBe('USA')
    expect(docTitle).toBe('Untitled')
  })

  it('suggestCanonicalFilename uses underscore slug', () => {
    expect(suggestCanonicalFilename('Above All')).toBe('above_all.chordpro')
    expect(suggestCanonicalFilename('All-in-All')).toBe('all_in_all.chordpro')
    expect(suggestCanonicalFilename('  Hello, World!  ')).toBe('hello_world.chordpro')
  })
})
