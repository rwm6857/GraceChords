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
})
