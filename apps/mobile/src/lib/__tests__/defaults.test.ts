import { describe, expect, it } from 'vitest'
import {
  DEFAULT_APP_DEFAULTS,
  getDefaultsSnapshot,
  hydrateDefaults,
  initialChordStyle,
  resolveThemeMode,
  setDefaultChordStyle,
  setDefaultKeepAwake,
  setDefaultTheme,
  type KVStorage,
} from '../defaults'

function memoryStorage(initial: Record<string, string> = {}): KVStorage & { store: Map<string, string> } {
  const store = new Map(Object.entries(initial))
  return {
    store,
    getItem: async (k) => store.get(k) ?? null,
    setItem: async (k, v) => void store.set(k, v),
    removeItem: async (k) => void store.delete(k),
  }
}

describe('defaults store', () => {
  it('falls back to DEFAULT_APP_DEFAULTS when nothing is stored', async () => {
    await hydrateDefaults(memoryStorage())
    expect(getDefaultsSnapshot()).toEqual(DEFAULT_APP_DEFAULTS)
    expect(getDefaultsSnapshot()).toEqual({ theme: 'system', chordStyle: 'letters', keepAwake: false })
  })

  it('ignores invalid stored values and uses fallbacks', async () => {
    await hydrateDefaults(memoryStorage({ 'gc.defaults.theme': 'neon', 'gc.defaults.chordStyle': 'tab' }))
    expect(getDefaultsSnapshot()).toEqual(DEFAULT_APP_DEFAULTS)
  })

  it('writes each setting through to storage and reflects it in the snapshot', async () => {
    const s = memoryStorage()
    await hydrateDefaults(s)

    setDefaultTheme('dark')
    setDefaultChordStyle('solfege')
    setDefaultKeepAwake(true)

    expect(getDefaultsSnapshot()).toEqual({ theme: 'dark', chordStyle: 'solfege', keepAwake: true })
    expect(s.store.get('gc.defaults.theme')).toBe('dark')
    expect(s.store.get('gc.defaults.chordStyle')).toBe('solfege')
    expect(s.store.get('gc.defaults.keepAwake')).toBe('1')
  })

  it('survives a simulated reload (re-hydrate from the same storage)', async () => {
    const s = memoryStorage()
    await hydrateDefaults(s)
    setDefaultTheme('light')
    setDefaultChordStyle('solfege')
    setDefaultKeepAwake(true)

    // Reset the cache to defaults via a fresh empty hydrate, then reload from `s`.
    await hydrateDefaults(memoryStorage())
    expect(getDefaultsSnapshot()).toEqual(DEFAULT_APP_DEFAULTS)

    await hydrateDefaults(s)
    expect(getDefaultsSnapshot()).toEqual({ theme: 'light', chordStyle: 'solfege', keepAwake: true })
  })

  it('hydrates keepAwake from storage and defaults it off', async () => {
    await hydrateDefaults(memoryStorage())
    expect(getDefaultsSnapshot().keepAwake).toBe(false)

    await hydrateDefaults(memoryStorage({ 'gc.defaults.keepAwake': '1' }))
    expect(getDefaultsSnapshot().keepAwake).toBe(true)

    await hydrateDefaults(memoryStorage({ 'gc.defaults.keepAwake': '0' }))
    expect(getDefaultsSnapshot().keepAwake).toBe(false)
  })

  it('returns a stable snapshot reference between changes', async () => {
    await hydrateDefaults(memoryStorage())
    const a = getDefaultsSnapshot()
    expect(getDefaultsSnapshot()).toBe(a)
    setDefaultTheme(a.theme) // no-op (same value) → reference unchanged
    expect(getDefaultsSnapshot()).toBe(a)
    setDefaultTheme('dark') // real change → new reference
    expect(getDefaultsSnapshot()).not.toBe(a)
  })
})

describe('resolveThemeMode', () => {
  it("'system' follows the OS scheme", () => {
    expect(resolveThemeMode('system', 'dark')).toBe('dark')
    expect(resolveThemeMode('system', 'light')).toBe('light')
    expect(resolveThemeMode('system', null)).toBe('light')
    expect(resolveThemeMode('system', undefined)).toBe('light')
  })

  it("'light'/'dark' force the mode regardless of scheme", () => {
    expect(resolveThemeMode('light', 'dark')).toBe('light')
    expect(resolveThemeMode('dark', 'light')).toBe('dark')
  })
})

describe('initialChordStyle', () => {
  it('seeds the viewer from the stored default', () => {
    expect(initialChordStyle({ theme: 'system', chordStyle: 'solfege', keepAwake: false })).toBe('solfege')
    expect(initialChordStyle({ theme: 'system', chordStyle: 'letters', keepAwake: false })).toBe('letters')
  })
})
