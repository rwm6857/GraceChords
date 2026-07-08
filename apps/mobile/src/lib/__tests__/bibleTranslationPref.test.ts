import { describe, expect, it } from 'vitest'
import type { BibleTranslation } from '@gracechords/core'
import {
  defaultTranslationForLocale,
  getBibleTranslationPref,
  hydrateBibleTranslationPref,
  setBibleTranslationPref,
  type KVStorage,
} from '../bibleTranslationPref'

function memoryStorage(initial: Record<string, string> = {}): KVStorage & { store: Map<string, string> } {
  const store = new Map(Object.entries(initial))
  return {
    store,
    getItem: async (k) => store.get(k) ?? null,
    setItem: async (k, v) => void store.set(k, v),
    removeItem: async (k) => void store.delete(k),
  }
}

const tr = (id: string, language: string): BibleTranslation => ({
  id,
  label: id.toUpperCase(),
  name: id,
  language,
  dataRoot: `bible/${language}/${id}`,
})

// Today's bundle: Arabic, Tedim Chin, English — no Turkish.
const TRANSLATIONS = [tr('esv', 'en'), tr('keh', 'ar'), tr('ctd', 'ctd')]
const MANIFEST_DEFAULT = 'esv'

describe('bible translation pref store', () => {
  it('is empty when nothing is stored', async () => {
    await hydrateBibleTranslationPref(memoryStorage())
    expect(getBibleTranslationPref()).toBe('')
  })

  it('hydrates and writes through a stored pick', async () => {
    const s = memoryStorage()
    await hydrateBibleTranslationPref(s)
    setBibleTranslationPref('keh')
    expect(getBibleTranslationPref()).toBe('keh')
    expect(s.store.get('gc.bible.translation.v1')).toBe('keh')

    // Simulated relaunch reads it back.
    await hydrateBibleTranslationPref(memoryStorage())
    expect(getBibleTranslationPref()).toBe('')
    await hydrateBibleTranslationPref(s)
    expect(getBibleTranslationPref()).toBe('keh')
  })
})

describe('defaultTranslationForLocale', () => {
  it('picks the manifest translation matching the app locale', () => {
    expect(defaultTranslationForLocale('ar', TRANSLATIONS, MANIFEST_DEFAULT)).toBe('keh')
    expect(defaultTranslationForLocale('en', TRANSLATIONS, MANIFEST_DEFAULT)).toBe('esv')
  })

  it('matches on the base language, ignoring region', () => {
    expect(defaultTranslationForLocale('ar-EG', TRANSLATIONS, MANIFEST_DEFAULT)).toBe('keh')
  })

  it('falls through to ESV for a Turkish locale (no Turkish Bible bundled today)', () => {
    expect(defaultTranslationForLocale('tr', TRANSLATIONS, MANIFEST_DEFAULT)).toBe('esv')
  })

  it('automatically picks up a Turkish translation once the manifest carries one', () => {
    const withTurkish = [...TRANSLATIONS, tr('tcl', 'tr')]
    expect(defaultTranslationForLocale('tr', withTurkish, MANIFEST_DEFAULT)).toBe('tcl')
  })
})
