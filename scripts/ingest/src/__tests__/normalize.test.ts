import { describe, expect, it } from 'vitest'
import { normalizeChordPro } from '../utils/normalize.js'

describe('normalizeChordPro', () => {
  it('fixes OCR hyphenation and stray symbols', () => {
    const input = '{title: Test}\n[G]ev\u2019ry knee shall bow at your throne in wor - ship;\nGuide~ me\n'
    const output = normalizeChordPro(input, { title: 'Test' })
    expect(output).toContain('worship;')
    expect(output).toContain('Guide me')
  })

  it('capitalizes lines after section headers', () => {
    const input = '{sov Verse 1}\n[C]shall declare your glory,\n{eov}\n'
    const output = normalizeChordPro(input, { title: 'Test' })
    expect(output).toContain('[C]Shall declare your glory,')
  })

  it('maps OpenSong section markers to directives', () => {
    const input = '[V1]\nHello there\n\n[C1]\nHi again\n\n[P1]\nPre chorus\n'
    const output = normalizeChordPro(input, { title: 'Test' })
    expect(output).toContain('{sov}')
    expect(output).toContain('{eov}')
    expect(output).toContain('{soc}')
    expect(output).toContain('{soc Pre-Chorus}')
  })

  it('keeps numbering when multiple OpenSong sections exist', () => {
    const input = '[V1]\nHello\n\n[V2]\nAgain\n'
    const output = normalizeChordPro(input, { title: 'Test' })
    expect(output).toContain('{sov Verse 1}')
    expect(output).toContain('{sov Verse 2}')
  })

  it('numbers multiple choruses and pre-choruses separately', () => {
    const input = '[C1]\nHi\n\n[C2]\nAgain\n\n[P1]\nPre\n\n[P2]\nPre again\n'
    const output = normalizeChordPro(input, { title: 'Test' })
    expect(output).toContain('{soc Chorus 1}')
    expect(output).toContain('{soc Chorus 2}')
    expect(output).toContain('{soc Pre-Chorus 1}')
    expect(output).toContain('{soc Pre-Chorus 2}')
  })

  it('drops intro/instrumental lines', () => {
    const input = '{title: Test}\nIntroA D E (6/8)\nInst A D E\nVerse line\n'
    const output = normalizeChordPro(input, { title: 'Test' })
    expect(output).not.toContain('Intro')
    expect(output).not.toContain('Inst')
    expect(output).toContain('Verse line')
  })

  it('inserts blank line before section end except last section', () => {
    const input = 'Verse\nLine one\nChorus\nLine two\n'
    const output = normalizeChordPro(input, { title: 'Test' })
    expect(output).toContain('Line one\n\n{eov}\n{soc}')
    expect(output).toContain('Line two\n{eoc}')
    expect(output).not.toContain('Line two\n\n{eoc}')
  })

  it('keeps blank lines within a section without closing', () => {
    const input = 'Verse\nLine one\n\nLine two\nChorus\nLine three\n'
    const output = normalizeChordPro(input, { title: 'Test' })
    expect(output).toContain('Line one\n\nLine two\n\n{eov}\n{soc}')
  })
})
