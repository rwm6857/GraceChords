import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  listBibleTranslations,
  readBibleTranslationPreference,
  resolveBibleTranslationSelection,
  writeBibleTranslationPreference,
} from '../translations'

const MANIFEST_URL = '/bible/translations.json'

function mockManifest(translations: Array<Record<string, unknown>>, defaultTranslation = ''){
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    if (!String(input).includes(MANIFEST_URL)) {
      return { ok: false, status: 404, json: async () => ({}) }
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ defaultTranslation, translations }),
    }
  })
  vi.stubGlobal('fetch', fetchMock)
}

describe('bible translations defaults', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('defaults to ESV when UI language resolves to english', async () => {
    localStorage.setItem('pref:songLanguage', 'en')
    mockManifest([
      { id: 'nvi', label: 'NVI', name: 'Nueva Versión Internacional', language: 'es', dataRoot: 'bible/es/nvi' },
      { id: 'esv', label: 'ESV', name: 'English Standard Version', language: 'en', dataRoot: 'bible/en/esv' },
      { id: 'ntb', label: 'NTB', name: 'TCL02 New Turkish Bible', language: 'tr', dataRoot: 'bible/tr/ntb' },
    ])

    const result = await listBibleTranslations({ force: true })
    expect(result.defaultTranslationId).toBe('esv')
  })

  it('defaults to first translation in UI language when UI is not english', async () => {
    localStorage.setItem('pref:songLanguage', 'tr')
    mockManifest([
      { id: 'esv', label: 'ESV', name: 'English Standard Version', language: 'en', dataRoot: 'bible/en/esv' },
      { id: 'yyc', label: 'YYÇ', name: 'Yeni Yaşam Ceviri', language: 'tr', dataRoot: 'bible/tr/yyc' },
      { id: 'ntb', label: 'NTB', name: 'TCL02 New Turkish Bible', language: 'tr', dataRoot: 'bible/tr/ntb' },
    ])

    const result = await listBibleTranslations({ force: true })
    expect(result.defaultTranslationId).toBe('yyc')
  })
})

describe('bible translation preference', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('reads empty when no saved preference exists and writes normalized ids', () => {
    expect(readBibleTranslationPreference()).toBe('')
    writeBibleTranslationPreference('NIV')
    expect(readBibleTranslationPreference()).toBe('niv')
  })
})

describe('resolveBibleTranslationSelection', () => {
  const translations = [
    { id: 'esv', label: 'ESV', name: 'English Standard Version', language: 'en', dataRoot: 'bible/en/esv' },
    { id: 'nvi', label: 'NVI', name: 'Nueva Versión Internacional', language: 'es', dataRoot: 'bible/es/nvi' },
  ]

  it('keeps a valid saved preference', () => {
    expect(resolveBibleTranslationSelection('nvi', translations, 'esv')).toBe('nvi')
  })

  it('falls back to default when saved preference is invalid', () => {
    expect(resolveBibleTranslationSelection('bad', translations, 'esv')).toBe('esv')
  })

  it('falls back to first available when both saved and default are missing', () => {
    const onlyTurkish = [
      { id: 'ntb', label: 'NTB', name: 'TCL02 New Turkish Bible', language: 'tr', dataRoot: 'bible/tr/ntb' },
      { id: 'yyc', label: 'YYÇ', name: 'Yeni Yaşam Ceviri', language: 'tr', dataRoot: 'bible/tr/yyc' },
    ]
    expect(resolveBibleTranslationSelection('', onlyTurkish, 'unknown')).toBe('ntb')
  })
})
