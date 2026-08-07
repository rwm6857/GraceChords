import { describe, expect, it, vi } from 'vitest'
import { LAUNCH_STORAGE_KEYS, primeLaunchStorage, type BatchKVStorage } from '../launchStorage'
import { DEFAULT_APP_DEFAULTS, hydrateDefaults } from '../defaults'
import { hydrateBibleTranslationPref, getBibleTranslationPref } from '../bibleTranslationPref'
import { hydrateRecents, getRecentlyOpened } from '../recents'
import { hydrateReadingStreak, getReadingStreak, DEFAULT_READING_STREAK } from '../readingStreak'
import { hydrateReaderReminder, getReaderReminder, DEFAULT_READER_REMINDER } from '../readerReminder'
import { hydrateViewerPrefs, getColumnMode } from '../viewerPrefs'
import {
  __resetReflectionDayStoreForTest,
  getReflectionDay,
  hydrateTodayReflection,
  reflectionCacheKey,
} from '../reflectionDayStore'

// The whole point of the facade is that the ten hydrate modules are unchanged,
// so these tests assert the OUTCOME each module produces when fed through a
// batch — not the facade in isolation. A silent change to any fallback here
// would reset a real user's preference on upgrade.

/** Fixed "now" so the reflection cases don't depend on the day they run. */
const REFLECTION_NOW = new Date('2026-08-07T12:00:00')

function makeStore(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed))
  const store: BatchKVStorage & { multiGetCalls: number; getItemCalls: string[] } = {
    multiGetCalls: 0,
    getItemCalls: [],
    async multiGet(keys) {
      store.multiGetCalls += 1
      return keys.map((key) => [key, data.has(key) ? (data.get(key) as string) : null] as const)
    },
    async getItem(key) {
      store.getItemCalls.push(key)
      return data.has(key) ? (data.get(key) as string) : null
    },
    async setItem(key, value) {
      data.set(key, value)
    },
    async removeItem(key) {
      data.delete(key)
    },
  }
  return { store, data }
}

describe('LAUNCH_STORAGE_KEYS', () => {
  it('covers the 14 keys the splash gate reads', () => {
    expect(LAUNCH_STORAGE_KEYS).toHaveLength(14)
    expect(new Set(LAUNCH_STORAGE_KEYS).size).toBe(14)
  })
})

describe('primeLaunchStorage', () => {
  it('reads every key in ONE multiGet and serves hydration from it', async () => {
    const { store } = makeStore()
    const primed = await primeLaunchStorage(store)
    await Promise.all(LAUNCH_STORAGE_KEYS.map((key) => primed.getItem(key)))
    expect(store.multiGetCalls).toBe(1)
    expect(store.getItemCalls).toEqual([])
  })

  it('delegates a key outside the batch to the real store', async () => {
    const { store } = makeStore({ 'gc.viewer.autoHideChrome': '1' })
    const primed = await primeLaunchStorage(store)
    await expect(primed.getItem('gc.viewer.autoHideChrome')).resolves.toBe('1')
    expect(store.getItemCalls).toEqual(['gc.viewer.autoHideChrome'])
  })

  it('falls back to the real store when multiGet rejects', async () => {
    // Today each module does its own getItem behind its own try/catch, so one
    // failing read can only affect one module. A batch that reset all 14
    // keys to defaults at once would be a far worse failure.
    const { store } = makeStore({ 'gc.defaults.theme': 'dark' })
    store.multiGet = () => Promise.reject(new Error('storage unavailable'))
    const primed = await primeLaunchStorage(store)
    expect(primed).toBe(store)
    await expect(hydrateDefaults(primed)).resolves.toMatchObject({ theme: 'dark' })
  })

  it('serves a primed key once, then defers to the real store', async () => {
    // The hydrate modules keep whatever storage they were handed for
    // write-through, for the app's whole lifetime — so the facade must stay
    // correct long after launch, never answering from a stale snapshot.
    const { store, data } = makeStore({ 'gc.defaults.theme': 'dark' })
    const primed = await primeLaunchStorage(store)
    await expect(primed.getItem('gc.defaults.theme')).resolves.toBe('dark')
    data.set('gc.defaults.theme', 'light')
    await expect(primed.getItem('gc.defaults.theme')).resolves.toBe('light')
  })

  it('writes through, and a later read sees the written value', async () => {
    const { store, data } = makeStore({ 'gc.defaults.theme': 'dark' })
    const primed = await primeLaunchStorage(store)
    await primed.setItem('gc.defaults.theme', 'light')
    expect(data.get('gc.defaults.theme')).toBe('light')
    await expect(primed.getItem('gc.defaults.theme')).resolves.toBe('light')
  })

  it('removes through, and a later read sees the removal', async () => {
    const { store, data } = makeStore({ 'gc.defaults.language': 'ko' })
    const primed = await primeLaunchStorage(store)
    await primed.removeItem('gc.defaults.language')
    expect(data.has('gc.defaults.language')).toBe(false)
    await expect(primed.getItem('gc.defaults.language')).resolves.toBeNull()
  })

  it('treats a pair missing from the multiGet response as null', async () => {
    const { store } = makeStore()
    store.multiGet = async () => [['gc.defaults.theme', 'dark'] as const]
    const primed = await primeLaunchStorage(store)
    await expect(primed.getItem('gc.defaults.theme')).resolves.toBe('dark')
    // Not in the response at all — must read exactly like an absent key, which
    // is what every module's missing-value branch already handles.
    await expect(primed.getItem('gc.defaults.chordStyle')).resolves.toBeNull()
  })
})

describe('fallbacks are unchanged, batched vs unbatched', () => {
  // Each case runs the SAME module twice — once against the raw store, once
  // against the primed facade — and requires identical results.
  const cases: Array<{
    name: string
    seed: Record<string, string>
    run: (store: BatchKVStorage | Awaited<ReturnType<typeof primeLaunchStorage>>) => Promise<unknown>
  }> = [
    {
      name: 'defaults: all keys absent',
      seed: {},
      run: async (s) => hydrateDefaults(s),
    },
    {
      name: 'defaults: all keys valid',
      seed: {
        'gc.defaults.theme': 'dark',
        'gc.defaults.chordStyle': 'solfege',
        'gc.defaults.keepAwake': '1',
        'gc.defaults.language': 'ko',
        'gc.defaults.dailyWordDestination': 'reader',
      },
      run: async (s) => hydrateDefaults(s),
    },
    {
      name: 'defaults: every key malformed',
      seed: {
        'gc.defaults.theme': 'neon',
        'gc.defaults.chordStyle': 'numbers',
        'gc.defaults.keepAwake': 'true',
        'gc.defaults.language': '   ',
        'gc.defaults.dailyWordDestination': 'somewhere',
      },
      run: async (s) => hydrateDefaults(s),
    },
    {
      name: 'recents: malformed JSON',
      seed: { 'gc.recents.songs.v1': '{not json' },
      run: async (s) => {
        await hydrateRecents(s)
        return getRecentlyOpened()
      },
    },
    {
      name: 'recents: valid rows plus one junk row',
      seed: {
        'gc.recents.songs.v1': JSON.stringify([
          { slug: 'a', title: 'A', openedAt: '2026-01-01T00:00:00Z' },
          { slug: 'b' },
        ]),
      },
      run: async (s) => {
        await hydrateRecents(s)
        return getRecentlyOpened()
      },
    },
    {
      name: 'reading streak: wrong shape',
      seed: { 'gc.readingStreak.v1': JSON.stringify({ enabled: 'yes' }) },
      run: async (s) => {
        await hydrateReadingStreak(s)
        return getReadingStreak()
      },
    },
    {
      name: 'reader reminder: out-of-range hour is clamped',
      seed: { 'gc.readerReminder.v1': JSON.stringify({ enabled: true, hour: 99, minute: -5 }) },
      run: async (s) => {
        await hydrateReaderReminder(s)
        return getReaderReminder()
      },
    },
    {
      name: 'viewer prefs: malformed JSON',
      seed: { 'gc.viewer.columnMode.v1': 'null' },
      run: async (s) => {
        await hydrateViewerPrefs(s)
        return getColumnMode('anything')
      },
    },
    {
      name: 'today’s reflection: cached entry',
      seed: {
        'gc.reflection.today.v1': JSON.stringify({
          userId: 'user-1',
          date: '2026-08-07',
          reflection: {
            id: 'r1',
            user_id: 'user-1',
            reflection_date: '2026-08-07',
            content_key: null,
            visibility: 'private',
            body: 'cached',
            created_at: '2026-08-07T09:00:00Z',
          },
        }),
      },
      run: async (s) => {
        // Module-level store, and `run` is called twice (direct then batched) —
        // reset so the second pass genuinely re-reads rather than seeing the first.
        __resetReflectionDayStoreForTest()
        await hydrateTodayReflection(s, REFLECTION_NOW)
        return getReflectionDay(reflectionCacheKey('user-1', '2026-08-07')) ?? null
      },
    },
    {
      name: 'today’s reflection: entry from an earlier day is dropped',
      seed: {
        'gc.reflection.today.v1': JSON.stringify({
          userId: 'user-1',
          date: '2026-08-06',
          reflection: null,
        }),
      },
      run: async (s) => {
        __resetReflectionDayStoreForTest()
        await hydrateTodayReflection(s, REFLECTION_NOW)
        return getReflectionDay(reflectionCacheKey('user-1', '2026-08-06')) ?? null
      },
    },
    {
      name: 'bible translation: whitespace only',
      seed: { 'gc.bible.translation.v1': '   ' },
      run: async (s) => {
        await hydrateBibleTranslationPref(s)
        return getBibleTranslationPref()
      },
    },
    {
      name: 'bible translation: valid pick',
      seed: { 'gc.bible.translation.v1': 'KJV' },
      run: async (s) => {
        await hydrateBibleTranslationPref(s)
        return getBibleTranslationPref()
      },
    },
  ]

  for (const testCase of cases) {
    it(testCase.name, async () => {
      const direct = makeStore(testCase.seed)
      const unbatched = await testCase.run(direct.store)

      const batched = makeStore(testCase.seed)
      const primed = await primeLaunchStorage(batched.store)
      const viaBatch = await testCase.run(primed)

      expect(viaBatch).toStrictEqual(unbatched)
    })
  }

  it('pins the documented defaults so a drift shows up here', async () => {
    const { store } = makeStore()
    const primed = await primeLaunchStorage(store)
    await expect(hydrateDefaults(primed)).resolves.toStrictEqual(DEFAULT_APP_DEFAULTS)
    await hydrateReadingStreak(primed)
    expect(getReadingStreak()).toStrictEqual(DEFAULT_READING_STREAK)
    await hydrateReaderReminder(primed)
    expect(getReaderReminder()).toStrictEqual(DEFAULT_READER_REMINDER)
    await hydrateBibleTranslationPref(primed)
    expect(getBibleTranslationPref()).toBe('')
    await hydrateRecents(primed)
    expect(getRecentlyOpened()).toStrictEqual([])
    await hydrateViewerPrefs(primed)
    expect(getColumnMode(undefined)).toBe('single')
  })

  it('keeps defaults.ts all-or-nothing on a per-key read failure', async () => {
    // Pre-existing behaviour worth pinning: defaults.ts wraps its five reads in
    // Promise.all, so one rejecting read discards all five. The batch must not
    // quietly "improve" this into per-key degradation either.
    const { store } = makeStore({ 'gc.defaults.theme': 'dark' })
    const failing = {
      ...store,
      getItem: vi.fn(async (key: string) => {
        if (key === 'gc.defaults.chordStyle') throw new Error('read failed')
        return store.getItem(key)
      }),
    } as unknown as BatchKVStorage
    await expect(hydrateDefaults(failing)).resolves.toStrictEqual(DEFAULT_APP_DEFAULTS)
  })
})
