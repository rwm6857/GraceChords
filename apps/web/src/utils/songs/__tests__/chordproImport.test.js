import { describe, it, expect } from 'vitest'
import { parseChordProOrLegacy } from '@gracechords/core'
import { isBodyDirective } from '../chordproImport'

describe('isBodyDirective', () => {
  it('keeps section, comment and capo directives in the body', () => {
    for (const line of [
      '{start_of_chorus}', '{end_of_verse}', '{start_of_verse: Verse 2}',
      '{soc}', '{eoc}', '{sov Verse 1}', '{sov: Verse 1}', '{eov}', '{sob}', '{eob}',
      '{c: Repeat x2}', '{comment: Softly}', '{capo: 3}', '  {soc}  ',
    ]) {
      expect(isBodyDirective(line), line).toBe(true)
    }
  })

  it('leaves metadata and unrelated directives alone', () => {
    for (const line of ['{title: Song}', '{key: G}', '{country: US}', '{copyright: x}', '{socks}', 'plain [G]lyric']) {
      expect(isBodyDirective(line), line).toBe(false)
    }
  })

  it('agrees with the parser on short section markers', () => {
    const doc = parseChordProOrLegacy('{soc}\n[G]Hallelujah\n{eoc}')
    expect(doc.sections.some((s) => s.kind === 'chorus')).toBe(true)
  })
})
