import { useSyncExternalStore } from 'react'
import type { KVStorage } from './defaults'

// Locally-hidden public reflections. "Hide this post" is a device-local,
// anonymity-compatible substitute for user-to-user blocking (posts have no
// visible author to block). Reporting a post also hides it here. Device-local
// (AsyncStorage), never synced to Supabase.
//
// Follows the readingStreak.ts pattern: storage is INJECTED so the module is
// RN-free / unit-testable headless; the app root hydrates once at splash, after
// which reads are synchronous and useHiddenPosts() re-renders subscribers. The
// in-memory cache is a Set replaced with a NEW Set on every change so
// useSyncExternalStore sees a stable reference between changes.

const STORAGE_KEY = 'gc.hiddenReflections.v1'

let cache: ReadonlySet<string> = new Set<string>()
let storage: KVStorage | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function persist() {
  storage?.setItem(STORAGE_KEY, JSON.stringify([...cache])).catch(() => {})
}

/** Load the stored hidden-id list; a bad read falls back to empty. */
export async function hydrateHiddenPosts(store: KVStorage): Promise<ReadonlySet<string>> {
  storage = store
  try {
    const parsed = JSON.parse((await store.getItem(STORAGE_KEY)) ?? 'null') as unknown
    cache = Array.isArray(parsed)
      ? new Set(parsed.filter((x): x is string => typeof x === 'string'))
      : new Set<string>()
  } catch {
    cache = new Set<string>()
  }
  emit()
  return cache
}

/** Synchronous read of the current hidden set (safe before hydrate — empty). */
export function getHiddenPosts(): ReadonlySet<string> {
  return cache
}

export function isHidden(id: string): boolean {
  return cache.has(id)
}

/** Hide a post locally (idempotent). */
export function hideReflection(id: string): void {
  if (cache.has(id)) return
  const next = new Set(cache)
  next.add(id)
  cache = next
  emit()
  persist()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Subscribing hook — re-renders when the hidden set changes. */
export function useHiddenPosts(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, getHiddenPosts, getHiddenPosts)
}

/** Test-only reset so each test starts from a clean module state. */
export function __resetHiddenPostsForTest(): void {
  cache = new Set<string>()
  storage = null
}
