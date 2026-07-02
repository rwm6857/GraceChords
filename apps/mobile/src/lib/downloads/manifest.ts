import { useSyncExternalStore } from 'react'
import type { BibleDownload, KVStorage } from './types'

// Device-local download manifest — which Bible translations are on this device,
// plus the "Wi-Fi only" preference. Follows the defaults.ts pattern exactly:
// storage is INJECTED (a KVStorage), hydrated once at splash, then read
// synchronously via a stable-reference snapshot so screens seed state with no
// flash and useSyncExternalStore stays correct. Device-local, NOT Supabase-synced.

export type DownloadsState = {
  /** Completed downloads keyed by translation id. */
  records: Record<string, BibleDownload>
  /** "Download over Wi-Fi only" preference. */
  wifiOnly: boolean
}

export const DEFAULT_DOWNLOADS_STATE: DownloadsState = {
  records: {},
  wifiOnly: false,
}

const STORAGE_KEY = 'gc.downloads.v1'

// Replaced with a NEW object on every change so getSnapshot returns a stable
// reference between changes (required — it must not build a fresh object each call).
let cache: DownloadsState = DEFAULT_DOWNLOADS_STATE
let storage: KVStorage | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function persist() {
  storage?.setItem(STORAGE_KEY, JSON.stringify(cache)).catch(() => {})
}

function isBibleDownload(v: unknown): v is BibleDownload {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  return (
    typeof r.id === 'string' &&
    r.type === 'bible' &&
    typeof r.dataRoot === 'string' &&
    r.status === 'complete'
  )
}

function parseState(raw: string | null): DownloadsState {
  if (!raw) return DEFAULT_DOWNLOADS_STATE
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return DEFAULT_DOWNLOADS_STATE
    const obj = parsed as Record<string, unknown>
    const records: Record<string, BibleDownload> = {}
    const rawRecords = obj.records
    if (rawRecords && typeof rawRecords === 'object') {
      for (const [id, value] of Object.entries(rawRecords as Record<string, unknown>)) {
        if (isBibleDownload(value)) records[id] = value
      }
    }
    return { records, wifiOnly: obj.wifiOnly === true }
  } catch {
    return DEFAULT_DOWNLOADS_STATE
  }
}

/**
 * Load the manifest into the cache and remember `store` for write-through. A bad
 * read never crashes the app — it falls back to the empty state. Safe to call
 * again to re-read from the same storage (used to simulate a reload in tests).
 */
export async function hydrateDownloads(store: KVStorage): Promise<DownloadsState> {
  storage = store
  let next = DEFAULT_DOWNLOADS_STATE
  try {
    next = parseState(await store.getItem(STORAGE_KEY))
  } catch {
    // best-effort — fall back to the empty state
  }
  cache = next
  emit()
  return cache
}

/** Synchronous read of the current manifest (safe before hydrate — empty state). */
export function getDownloadsSnapshot(): DownloadsState {
  return cache
}

/** Record (or replace) a completed download and persist. */
export function upsertDownload(record: BibleDownload): void {
  cache = { ...cache, records: { ...cache.records, [record.id]: record } }
  emit()
  persist()
}

/** Remove a download from the manifest and persist. Returns the removed record, if any. */
export function removeDownload(id: string): BibleDownload | null {
  const existing = cache.records[id]
  if (!existing) return null
  const nextRecords = { ...cache.records }
  delete nextRecords[id]
  cache = { ...cache, records: nextRecords }
  emit()
  persist()
  return existing
}

/** Look up a single record (undefined when not downloaded). */
export function getDownload(id: string): BibleDownload | undefined {
  return cache.records[id]
}

export function isDownloaded(id: string): boolean {
  return Boolean(cache.records[id])
}

export function setWifiOnly(value: boolean): void {
  if (cache.wifiOnly === value) return
  cache = { ...cache, wifiOnly: value }
  emit()
  persist()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Subscribing hook — re-renders the Offline screen on any manifest change. */
export function useDownloads(): DownloadsState {
  return useSyncExternalStore(subscribe, getDownloadsSnapshot, getDownloadsSnapshot)
}

/** Test-only reset so each test starts from a clean module state. */
export function __resetDownloadsForTest(): void {
  cache = DEFAULT_DOWNLOADS_STATE
  storage = null
  listeners.clear()
}
