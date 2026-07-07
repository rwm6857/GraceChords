import { describe, expect, it } from 'vitest'
import { localeLabel, normalizeLanguageTag, resolveLanguage } from '../config'

const SUPPORTED = ['en', 'tr']

describe('resolveLanguage', () => {
  it('uses the stored pick when supported', () => {
    expect(resolveLanguage('tr', ['en-US'], SUPPORTED)).toBe('tr')
  })

  it('normalizes regional stored picks', () => {
    expect(resolveLanguage('tr-TR', ['en-US'], SUPPORTED)).toBe('tr')
  })

  it('ignores an unsupported stored pick and falls back to the device', () => {
    expect(resolveLanguage('fr', ['tr-TR', 'en-US'], SUPPORTED)).toBe('tr')
  })

  it('uses the first supported device language when nothing is stored', () => {
    expect(resolveLanguage(null, ['de-DE', 'tr-TR', 'en-US'], SUPPORTED)).toBe('tr')
  })

  it('falls back to English when neither stored nor device languages are supported', () => {
    expect(resolveLanguage(null, ['de-DE', 'fr-FR'], SUPPORTED)).toBe('en')
    expect(resolveLanguage(null, [], SUPPORTED)).toBe('en')
  })

  it('treats empty stored values as follow-device', () => {
    expect(resolveLanguage('', ['tr-TR'], SUPPORTED)).toBe('tr')
    expect(resolveLanguage(undefined, ['tr-TR'], SUPPORTED)).toBe('tr')
  })
})

describe('normalizeLanguageTag', () => {
  it('lowercases and strips region for - and _ separators', () => {
    expect(normalizeLanguageTag('ko-KR')).toBe('ko')
    expect(normalizeLanguageTag('en_US')).toBe('en')
    expect(normalizeLanguageTag(' TR ')).toBe('tr')
    expect(normalizeLanguageTag(null)).toBe('')
  })
})

describe('localeLabel', () => {
  it('returns native names for known codes and uppercased codes otherwise', () => {
    expect(localeLabel('en')).toBe('English')
    expect(localeLabel('tr')).toBe('Türkçe')
    expect(localeLabel('xx')).toBe('XX')
  })
})
