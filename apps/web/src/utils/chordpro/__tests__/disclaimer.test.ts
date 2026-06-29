import { describe, expect, test } from 'vitest'
import { hasDisclaimerCommentBlock, appendDisclaimerIfMissing } from '../../chordpro/disclaimer'

const BLOCK = [
  '# --- DISCLAIMER (GraceChords) ---',
  '# All lyrics and music are the property of their respective owners. GraceChords provides tools for personal worship and educational use only. Do not repost or redistribute copyrighted lyrics/charts. Rights holder, email us for takedown requests.',
  '# --- END DISCLAIMER ---',
  ''
].join('\n')

describe('ChordPro disclaimer utils', () => {
  test('detects presence of disclaimer block', () => {
    const txt = `Line 1\nLine 2\n${BLOCK}`
    expect(hasDisclaimerCommentBlock(txt)).toBe(true)
  })

  test('appendDisclaimerIfMissing adds when absent', () => {
    const txt = 'Some content\n'
    const out = appendDisclaimerIfMissing(txt)
    expect(out.endsWith(BLOCK)).toBe(true)
  })

  test('appendDisclaimerIfMissing is idempotent', () => {
    const txt = `Some content\n\n${BLOCK}`
    const out = appendDisclaimerIfMissing(txt)
    expect(out).toBe(txt)
  })
})
