import { useSyncExternalStore } from 'react'
import type { KVStorage } from '../defaults'
import { DEFAULT_PROGRESSION_ID, progressionById } from './progressions'
import type { DisplayMode } from './types'

// Key Reference preferences: which progression is selected, and how chords are
// written. Device-local (AsyncStorage), NOT Supabase-synced.
//
// An earlier revision pinned four progressions to four slots, with a picker
// sheet per slot. The whole set is now one scrollable list, so there is nothing
// to pin — a `pinned` array in a stored payload is simply ignored, and the
// selection it used to imply is replaced by `selectedId`.
//
// Follows the defaults.ts / viewerPrefs.ts pattern — storage is INJECTED so the
// module is RN-free and unit-testable headless, the cache is replaced with a new
// object on every change so useSyncExternalStore sees a stable reference between
// changes, and a bad read degrades to defaults rather than crashing.
//
// Unlike those two it is NOT part of the splash batch and its key is NOT in
// LAUNCH_STORAGE_KEYS: nothing on the launch path reads it, so it hydrates when
// the screen mounts, the way the other screen-scoped preferences do.
//
// The SELECTED KEY is deliberately not persisted. This screen is standalone and
// starts from a manual choice every time.

export type KeyRefPrefs = {
  /** Progression id, or null when nothing is selected. */
  selectedId: string | null
  display: DisplayMode
}

export const DEFAULT_KEY_REF_PREFS: KeyRefPrefs = {
  selectedId: DEFAULT_PROGRESSION_ID,
  display: 'letters',
}

const STORAGE_KEY = 'gc.keyref.v1'
const DISPLAY_MODES: readonly DisplayMode[] = ['letters', 'numbers', 'nashville']

let cache: KeyRefPrefs = DEFAULT_KEY_REF_PREFS
let storage: KVStorage | null = null
let hydrated = false
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function isDisplayMode(v: unknown): v is DisplayMode {
  return typeof v === 'string' && (DISPLAY_MODES as readonly string[]).includes(v)
}

/**
 * Coerce a stored payload. An id no longer in the data drops to null — a
 * progression can be renamed or retired without wedging someone's screen.
 */
function parse(raw: string | null): KeyRefPrefs {
  if (!raw) return DEFAULT_KEY_REF_PREFS
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return DEFAULT_KEY_REF_PREFS
    const record = parsed as Record<string, unknown>
    const stored = record.selectedId
    const selectedId =
      typeof stored === 'string' && progressionById(stored) ? stored : DEFAULT_PROGRESSION_ID
    return { selectedId, display: isDisplayMode(record.display) ? record.display : 'letters' }
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

export function setSelectedProgression(id: string | null): void {
  if (cache.selectedId === id) return
  cache = { ...cache, selectedId: id }
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

/** Subscribing hook — re-renders on a selection or display-mode change. */
export function useKeyRefPrefs(): KeyRefPrefs {
  return useSyncExternalStore(subscribe, getKeyRefPrefs, getKeyRefPrefs)
}

/** Test-only reset so each test starts from a clean module state. */
export function __resetKeyRefPrefsForTest(): void {
  cache = DEFAULT_KEY_REF_PREFS
  storage = null
  hydrated = false
}
