import { useSyncExternalStore } from 'react'

// Whether this device has already been shown the first-launch intro (the 3-card
// pager at app/intro.tsx). PER-DEVICE UI state, deliberately NOT on the Supabase
// profile: it says nothing about the account, and syncing it would mean a schema
// change for a flag whose whole job is "has this install been introduced yet".
// A returning user on a new device seeing the intro again is intended.
//
// Follows the same injected-KVStorage / hydrate-once / useSyncExternalStore
// pattern as src/lib/defaults.ts, so this module is RN-free and unit-testable
// headless. The read MUST be synchronous by the time the auth gate runs — the
// gate in app/_layout.tsx decides between the intro and the tabs while the
// native splash is still up, and an async read there would paint Home for a
// frame first. That is why the key joins LAUNCH_STORAGE_KEYS' single multiGet
// rather than doing its own getItem.

export type KVStorage = {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

const STORAGE_KEY = 'gc.intro.seen.v1'

// '1' is the only truthy value, matching gc.defaults.keepAwake. Anything else
// (absent, '0', garbage) means "not seen" — the safe direction to fail, since a
// spurious extra intro is recoverable and a silently skipped one is not.
const SEEN_VALUE = '1'

let cache = false
let storage: KVStorage | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

/** Load the stored flag into the cache (false when unset). */
export async function hydrateIntroSeen(store: KVStorage): Promise<boolean> {
  storage = store
  let value = false
  try {
    value = (await store.getItem(STORAGE_KEY)) === SEEN_VALUE
  } catch {
    // Best-effort — a bad read must never crash the app. Falling back to false
    // shows the intro once more rather than swallowing it.
  }
  cache = value
  emit()
  return cache
}

/** Synchronous read — safe before hydrate (returns false). */
export function hasSeenIntro(): boolean {
  return cache
}

/**
 * Record that the intro has been shown. Called on BOTH completion and skip —
 * they are the same outcome, the user has seen it. Updates the cache
 * synchronously (so the auth gate re-evaluates before the navigation lands and
 * can't bounce back to the intro) and writes through best-effort.
 */
export function markIntroSeen(): void {
  if (cache) return
  cache = true
  emit()
  storage?.setItem(STORAGE_KEY, SEEN_VALUE).catch(() => {})
}

/**
 * Clear the flag so the intro shows again. Backs the Settings → "See onboarding
 * again" row, which exists so the intro can be re-checked without reinstalling.
 * Finishing or skipping the replayed intro sets the flag again, so this is not a
 * persistent "always show" mode.
 */
export function resetIntroSeen(): void {
  if (!cache) return
  cache = false
  emit()
  storage?.removeItem(STORAGE_KEY).catch(() => {})
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Subscribing hook — re-renders the auth gate when the flag is set. */
export function useIntroSeen(): boolean {
  return useSyncExternalStore(subscribe, hasSeenIntro, hasSeenIntro)
}
