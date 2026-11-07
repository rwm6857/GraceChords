import { describe, it, expect } from 'vitest'
import { pptxKeyStem } from '../pptxKey'

describe('pptxKeyStem', () => {
  it('prefers source_filename for imported songs', () => {
    expect(pptxKeyStem({ slug: 'ten_thousand_reasons', source_filename: '10_000_reasons' })).toBe('10_000_reasons')
  })

  it('falls back to the slug, normalising hyphens', () => {
    expect(pptxKeyStem({ slug: 'amazing_grace', source_filename: null })).toBe('amazing_grace')
    expect(pptxKeyStem({ slug: 'old-style-slug' })).toBe('old_style_slug')
  })

  it('returns an empty stem without a song', () => {
    expect(pptxKeyStem(null)).toBe('')
  })
})
