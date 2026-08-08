// One AsyncStorage round trip for the whole splash gate.
//
// The launch path hydrates ten device-local stores before first paint, and
// between them they read 14 keys with 14 separate getItem calls (five in
// defaults.ts alone). This module reads all 14 in a single multiGet and hands
// back a KVStorage-shaped facade served from the result.
//
// The point of the facade — rather than teaching each store to accept a
// pre-read value — is that NOT ONE LINE of parsing, validation or fallback logic
// in those stores changes. Nearly every key backs a user preference, and a
// silent behaviour change here would reset people's settings on upgrade.
// Equivalence is established by construction instead of by review.
//
// RN-free (storage is injected, like defaults.ts) so it unit-tests headless.

export type KVStorage = {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

/** AsyncStorage's shape, narrowed to what this module uses. */
export type BatchKVStorage = KVStorage & {
  multiGet(keys: string[]): Promise<readonly (readonly [string, string | null])[]>
}

/**
 * Every key read inside the splash-gating Promise.all in app/_layout.tsx, in
 * hydration order. Each one is owned by the module listed beside it, which is
 * also where its fallback lives — this list must stay in sync with those reads,
 * but a key MISSING from this list is harmless: the facade simply delegates that
 * getItem to the real store, exactly as today.
 *
 * Deliberately excluded: GoTrue's own session key (read behind the auth
 * navigator lock and bounded by GATE_MS, not by us), gc.pendingSprite (only read
 * on a SIGNED_IN event), and the screen-scoped keys in autoHideChrome.ts and
 * useDailyHighlights.ts, which are not on the launch path.
 */
export const LAUNCH_STORAGE_KEYS = [
  'gc.defaults.theme', // defaults.ts             → 'system'
  'gc.defaults.chordStyle', // defaults.ts             → 'letters'
  'gc.defaults.keepAwake', // defaults.ts             → false ('1' is the only true)
  'gc.defaults.language', // defaults.ts             → null (follow device)
  'gc.defaults.dailyWordDestination', // defaults.ts   → 'landing'
  'gc.downloads.v1', // downloads/manifest.ts   → DEFAULT_DOWNLOADS_STATE
  'gc.songdrafts.v1', // drafts/draftsStore.ts   → DEFAULT_DRAFTS_STATE
  'gc.recents.songs.v1', // recents.ts              → []
  'gc.readingStreak.v1', // readingStreak.ts        → DEFAULT_READING_STREAK
  'gc.readerReminder.v1', // readerReminder.ts       → DEFAULT_READER_REMINDER
  'gc.viewer.columnMode.v1', // viewerPrefs.ts       → EMPTY (default 'single')
  'gc.bible.translation.v1', // bibleTranslationPref.ts → '' (no prior choice)
  'gc.reflection.today.v1', // reflectionDayStore.ts   → null (nothing cached)
  'gc.intro.seen.v1', // introSeen.ts            → false ('1' is the only true)
] as const

/**
 * Read `keys` in one batch and return a KVStorage that serves those reads from
 * memory.
 *
 * Behaviour that is deliberately identical to 14 separate getItem calls:
 *
 * - A key absent from storage yields null, which is what every store's
 *   missing-value branch already handles. multiGet reports an absent key as
 *   [key, null], and a pair missing from the response falls to null too.
 * - A REJECTING multiGet returns the raw store untouched, so each module does
 *   its own getItem behind its own try/catch just as it does today. Without
 *   this, one failed batch would reset all 14 keys to defaults at once — a far
 *   worse failure than the per-module degradation we have now.
 *
 * The facade is a correct KVStorage for the app's whole lifetime, not just for
 * the launch read: the stores keep whatever storage they were handed for
 * write-through (`storage = store` in each hydrate function), so setDefaultTheme
 * will call this object hours later. Writes therefore delegate to the real
 * store, and each primed read is consumed once so any later read goes straight
 * to the real store rather than to a stale snapshot.
 */
export async function primeLaunchStorage(
  store: BatchKVStorage,
  keys: readonly string[] = LAUNCH_STORAGE_KEYS,
): Promise<KVStorage> {
  let primed: Map<string, string | null>
  try {
    const pairs = await store.multiGet([...keys])
    primed = new Map(pairs.map(([key, value]) => [key, value ?? null]))
  } catch {
    return store
  }

  return {
    getItem: async (key) => {
      if (!primed.has(key)) return store.getItem(key)
      const value = primed.get(key) ?? null
      primed.delete(key)
      return value
    },
    setItem: (key, value) => {
      primed.delete(key)
      return store.setItem(key, value)
    },
    removeItem: (key) => {
      primed.delete(key)
      return store.removeItem(key)
    },
  }
}
