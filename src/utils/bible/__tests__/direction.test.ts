import { describe, expect, it } from 'vitest'
import { isRtlBibleLanguage, normalizeBibleLanguageCode } from '../direction'

describe('bible RTL language detection', () => {
  it('normalizes language tags', () => {
    expect(normalizeBibleLanguageCode(' FA_IR ')).toBe('fa-ir')
    expect(normalizeBibleLanguageCode('ar')).toBe('ar')
  })

  it('detects rtl languages by base tag', () => {
    expect(isRtlBibleLanguage('ar')).toBe(true)
    expect(isRtlBibleLanguage('fa-IR')).toBe(true)
    expect(isRtlBibleLanguage('he')).toBe(true)
    expect(isRtlBibleLanguage('iw')).toBe(true)
  })

  it('does not mark ltr languages as rtl', () => {
    expect(isRtlBibleLanguage('en')).toBe(false)
    expect(isRtlBibleLanguage('tr')).toBe(false)
    expect(isRtlBibleLanguage('ko')).toBe(false)
    expect(isRtlBibleLanguage('')).toBe(false)
  })
})
