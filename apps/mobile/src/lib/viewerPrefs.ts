import { useSyncExternalStore } from 'react'
import type { KVStorage } from './defaults'

// Per-song viewer preferences — today just the column mode (1 or 2 columns on
// tablet widths). Device-local (AsyncStorage), NOT Supabase-synced.
//
// Resolution is per-song override → app-wide default → 'single'. The app-wide
// default is a storage seam only: nothing in the UI writes it in v1 (no
// Settings surface), it just keeps the fallback in one place.
//
// Follows the defaults.ts pattern: storage is INJECTED so the module is RN-free
// and unit-testable headless; the app root hydrates once during the splash
// hold, after which reads are synchronous. Storage stays lean — only overrides
// that differ from the resolved default are kept, and the key is removed
// entirely when nothing remains.

export type ColumnMode = 'single' | 'double'

export const DEFAULT_COLUMN_MODE: ColumnMode = 'single'

const STORAGE_KEY = 'gc.viewer.columnMode.v1'

type ViewerPrefs = {
  default: ColumnMode
  songs: Record<string, ColumnMode>
}

const EMPTY: ViewerPrefs = { default: DEFAULT_COLUMN_MODE, songs: {} }

let cache: ViewerPrefs = EMPTY
let storage: KVStorage | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function isColumnMode(v: unknown): v is ColumnMode {
  return v === 'single' || v === 'double'
}

function parse(raw: string | null): ViewerPrefs {
  if (!raw) return EMPTY
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return EMPTY
    const rec = parsed as Record<string, unknown>
    const def = isColumnMode(rec.default) ? rec.default : DEFAULT_COLUMN_MODE
    const songs: Record<string, ColumnMode> = {}
    if (rec.songs && typeof rec.songs === 'object') {
      for (const [slug, mode] of Object.entries(rec.songs as Record<string, unknown>)) {
        if (isColumnMode(mode) && mode !== def) songs[slug] = mode
      }
    }
    return { default: def, songs }
  } catch {
    return EMPTY
  }
}

function persist(): void {
  if (!storage) return
  const hasOverrides = Object.keys(cache.songs).length > 0
  if (!hasOverrides && cache.default === DEFAULT_COLUMN_MODE) {
    storage.removeItem(STORAGE_KEY).catch(() => {})
    return
  }
  const payload: Record<string, unknown> = { songs: cache.songs }
  if (cache.default !== DEFAULT_COLUMN_MODE) payload.default = cache.default
  storage.setItem(STORAGE_KEY, JSON.stringify(payload)).catch(() => {})
}

/**
 * Load stored prefs into the cache and remember `store` for write-through. A
 * bad read never crashes the app. Safe to call again to re-read from the same
 * storage (used to simulate a reload in tests).
 */
export async function hydrateViewerPrefs(store: KVStorage): Promise<void> {
  storage = store
  try {
    cache = parse(await store.getItem(STORAGE_KEY))
  } catch {
    cache = EMPTY
  }
  emit()
}

/** Resolved column mode for a song: per-song override → app default → single. */
export function getColumnMode(slug: string | undefined): ColumnMode {
  if (!slug) return cache.default
  return cache.songs[slug] ?? cache.default
}

/**
 * Persist a song's column mode. Setting a song back to the resolved default
 * removes its override instead of storing a redundant entry.
 */
export function setColumnMode(slug: string, mode: ColumnMode): void {
  if (!slug || getColumnMode(slug) === mode) return
  const songs = { ...cache.songs }
  if (mode === cache.default) delete songs[slug]
  else songs[slug] = mode
  cache = { ...cache, songs }
  emit()
  persist()
}

/** The app-wide default (storage seam only — no UI writes it in v1). */
export function getDefaultColumnMode(): ColumnMode {
  return cache.default
}

export function setDefaultColumnMode(mode: ColumnMode): void {
  if (cache.default === mode) return
  // Overrides equal to the new default become redundant; prune them.
  const songs: Record<string, ColumnMode> = {}
  for (const [slug, m] of Object.entries(cache.songs)) {
    if (m !== mode) songs[slug] = m
  }
  cache = { default: mode, songs }
  emit()
  persist()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Subscribing hook — the resolved mode for `slug`, re-rendering on change. */
export function useColumnMode(slug: string | undefined): ColumnMode {
  return useSyncExternalStore(
    subscribe,
    () => getColumnMode(slug),
    () => getColumnMode(slug),
  )
}

/** Test-only reset so each test starts from a clean module state. */
export function __resetViewerPrefsForTest(): void {
  cache = EMPTY
  storage = null
}
