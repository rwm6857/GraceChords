import { useSyncExternalStore } from 'react'
import type { KVStorage } from '../defaults'
import { DEFAULT_PINNED, progressionById } from './progressions'
import type { DisplayMode } from './types'

// Key Reference preferences: the four pinned progressions and the
// letters/numbers toggle. Device-local (AsyncStorage), NOT Supabase-synced.
//
// Follows the defaults.ts / viewerPrefs.ts pattern — storage is INJECTED so the
// module is RN-free and unit-testable headless, the cache is replaced with a new
// object on every change so useSyncExternalStore sees a stable reference between
// changes, and a bad read degrades to defaults rather than crashing.
//
// Unlike those two it is NOT part of the splash batch and its key is NOT in
// LAUNCH_STORAGE_KEYS: nothing on the launch path reads it, so it hydrates when
// the screen mounts, the way the other screen-scoped preferences do. The screen
// renders defaults for the one frame before the read lands.
//
// The SELECTED KEY is deliberately not persisted. This screen is standalone and
// starts from a manual choice every time.

export const PIN_COUNT = 4

export type KeyRefPrefs = {
  /** Progression ids, one per slot. null = an empty slot. */
  pinned: (string | null)[]
  display: DisplayMode
}

export const DEFAULT_KEY_REF_PREFS: KeyRefPrefs = {
  pinned: DEFAULT_PINNED.slice(0, PIN_COUNT),
  display: 'letters',
}

const STORAGE_KEY = 'gc.keyref.v1'

let cache: KeyRefPrefs = DEFAULT_KEY_REF_PREFS
let storage: KVStorage | null = null
let hydrated = false
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

/**
 * Coerce a stored payload. Slots are normalized to exactly PIN_COUNT entries and
 * an id no longer in the data drops to an empty slot — a progression can be
 * renamed or retired without wedging someone's saved strip.
 */
function parse(raw: string | null): KeyRefPrefs {
  if (!raw) return DEFAULT_KEY_REF_PREFS
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return DEFAULT_KEY_REF_PREFS
    const record = parsed as Record<string, unknown>
    const stored = Array.isArray(record.pinned) ? record.pinned : []
    const pinned = Array.from({ length: PIN_COUNT }, (_, i) => {
      const id = stored[i]
      return typeof id === 'string' && progressionById(id) ? id : null
    })
    const display: DisplayMode = record.display === 'numbers' ? 'numbers' : 'letters'
    return { pinned, display }
  } catch {
    return DEFAULT_KEY_REF_PREFS
  }
}

function persist(): void {
  storage?.setItem(STORAGE_KEY, JSON.stringify(cache)).catch(() => {})
}

/**
 * Load stored prefs and remember `store` for write-through. Safe to call again
 * (the screen calls it on every mount); the read only runs once, so returning to
 * the screen never clobbers an unwritten change.
 */
export async function hydrateKeyRefPrefs(store: KVStorage): Promise<void> {
  storage = store
  if (hydrated) return
  hydrated = true
  try {
    cache = parse(await store.getItem(STORAGE_KEY))
  } catch {
    cache = DEFAULT_KEY_REF_PREFS
  }
  emit()
}

export function getKeyRefPrefs(): KeyRefPrefs {
  return cache
}

/** Assign a progression to a slot, or clear it with null. */
export function setPinned(slot: number, id: string | null): void {
  if (slot < 0 || slot >= PIN_COUNT) return
  if (cache.pinned[slot] === id) return
  const pinned = cache.pinned.slice()
  pinned[slot] = id
  cache = { ...cache, pinned }
  emit()
  persist()
}

export function setDisplayMode(display: DisplayMode): void {
  if (cache.display === display) return
  cache = { ...cache, display }
  emit()
  persist()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Subscribing hook — re-renders on any pin or display-mode change. */
export function useKeyRefPrefs(): KeyRefPrefs {
  return useSyncExternalStore(subscribe, getKeyRefPrefs, getKeyRefPrefs)
}

/** Test-only reset so each test starts from a clean module state. */
export function __resetKeyRefPrefsForTest(): void {
  cache = DEFAULT_KEY_REF_PREFS
  storage = null
  hydrated = false
}
