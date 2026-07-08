import { useSyncExternalStore } from 'react'
import type { SongForm } from '@gracechords/core'
import type { KVStorage } from '../defaults'

// Device-local song-draft store. Same injected-KVStorage + useSyncExternalStore
// pattern as downloads/manifest.ts, with ONE difference: writes are DEBOUNCED.
// The whole blob is rewritten on every persist, so at autosave frequency
// (per-keystroke) an immediate write would thrash AsyncStorage — instead the
// in-memory cache + listeners update synchronously (instant UI) and the disk
// write coalesces. Call flushDrafts() on app-background / editor-unmount to
// force a pending write out.

export type DraftStatus = 'draft' | 'submitted' | 'publishing'

export type SongDraft = {
  id: string
  /** Set once the draft has been saved to personal_songs. */
  personalSongId?: string | null
  /** Published song this draft was forked from (fork model). */
  sourceSongId?: string | null
  /** Published song id once this draft has been published. */
  publishedSongId?: string | null
  form: SongForm
  status: DraftStatus
  updatedAt: string
}

export type DraftsState = {
  drafts: Record<string, SongDraft>
}

export const DEFAULT_DRAFTS_STATE: DraftsState = { drafts: {} }

const STORAGE_KEY = 'gc.songdrafts.v1'
const PERSIST_DELAY_MS = 600

let cache: DraftsState = DEFAULT_DRAFTS_STATE
let storage: KVStorage | null = null
let persistTimer: ReturnType<typeof setTimeout> | null = null
let dirty = false
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function writeNow() {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  if (!dirty) return
  dirty = false
  storage?.setItem(STORAGE_KEY, JSON.stringify(cache)).catch(() => {})
}

function schedulePersist() {
  dirty = true
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(writeNow, PERSIST_DELAY_MS)
}

function isSongDraft(v: unknown): v is SongDraft {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  return typeof r.id === 'string' && !!r.form && typeof r.form === 'object'
}

function parseState(raw: string | null): DraftsState {
  if (!raw) return DEFAULT_DRAFTS_STATE
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return DEFAULT_DRAFTS_STATE
    const obj = parsed as Record<string, unknown>
    const drafts: Record<string, SongDraft> = {}
    const raws = obj.drafts
    if (raws && typeof raws === 'object') {
      for (const [id, value] of Object.entries(raws as Record<string, unknown>)) {
        if (isSongDraft(value)) drafts[id] = value
      }
    }
    return { drafts }
  } catch {
    return DEFAULT_DRAFTS_STATE
  }
}

/** Load drafts into the cache and remember `store` for write-through. */
export async function hydrateDrafts(store: KVStorage): Promise<DraftsState> {
  storage = store
  let next = DEFAULT_DRAFTS_STATE
  try {
    next = parseState(await store.getItem(STORAGE_KEY))
  } catch {
    // best-effort
  }
  cache = next
  emit()
  return cache
}

export function getDraftsSnapshot(): DraftsState {
  return cache
}

export function getDraft(id: string): SongDraft | undefined {
  return cache.drafts[id]
}

/** Create or replace a draft. Stamps updatedAt and debounces the disk write. */
export function upsertDraft(record: SongDraft): void {
  const stamped = { ...record, updatedAt: new Date().toISOString() }
  cache = { drafts: { ...cache.drafts, [record.id]: stamped } }
  emit()
  schedulePersist()
}

export function removeDraft(id: string): void {
  if (!cache.drafts[id]) return
  const next = { ...cache.drafts }
  delete next[id]
  cache = { drafts: next }
  emit()
  schedulePersist()
}

/** Force any pending debounced write to disk immediately (AppState bg / unmount). */
export function flushDrafts(): void {
  writeNow()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useDrafts(): DraftsState {
  return useSyncExternalStore(subscribe, getDraftsSnapshot, getDraftsSnapshot)
}

export function useDraft(id: string | undefined): SongDraft | undefined {
  const state = useSyncExternalStore(subscribe, getDraftsSnapshot, getDraftsSnapshot)
  return id ? state.drafts[id] : undefined
}

/** Test-only reset. */
export function __resetDraftsForTest(): void {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = null
  dirty = false
  cache = DEFAULT_DRAFTS_STATE
  storage = null
  listeners.clear()
}
