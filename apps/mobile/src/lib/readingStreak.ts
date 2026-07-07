import { useSyncExternalStore } from 'react'
import type { KVStorage } from './defaults'

// Reading streak — consecutive days the user opened today's Daily Word
// reading. OPT-IN and off by default: nothing is tracked or shown until the
// user enables it (Daily Word → Reader settings). Device-local (AsyncStorage),
// NOT Supabase-synced.
//
// Follows the defaults.ts pattern: storage is INJECTED so the module is RN-free
// and unit-testable headless; the app root hydrates once at splash, after which
// reads are synchronous and `useReadingStreak` re-renders subscribers.

export type ReadingStreak = {
  enabled: boolean
  /** Consecutive-day count as of lastReadDate (raw — display via currentStreak). */
  count: number
  /** Local date key (YYYY-MM-DD) of the most recent counted read. */
  lastReadDate: string | null
}

export const DEFAULT_READING_STREAK: ReadingStreak = {
  enabled: false,
  count: 0,
  lastReadDate: null,
}

const STORAGE_KEY = 'gc.readingStreak.v1'

let cache: ReadingStreak = DEFAULT_READING_STREAK
let storage: KVStorage | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function persist() {
  storage?.setItem(STORAGE_KEY, JSON.stringify(cache)).catch(() => {})
}

/** Local-time date key — streaks follow the user's calendar day, not UTC. */
export function streakDateKey(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

function yesterdayKey(today: Date): string {
  const y = new Date(today)
  y.setDate(y.getDate() - 1)
  return streakDateKey(y)
}

function isReadingStreak(v: unknown): v is ReadingStreak {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  return (
    typeof r.enabled === 'boolean' &&
    typeof r.count === 'number' &&
    (r.lastReadDate === null || typeof r.lastReadDate === 'string')
  )
}

/** Load the stored streak; a bad read falls back to the (disabled) default. */
export async function hydrateReadingStreak(store: KVStorage): Promise<ReadingStreak> {
  storage = store
  try {
    const parsed = JSON.parse((await store.getItem(STORAGE_KEY)) ?? 'null') as unknown
    cache = isReadingStreak(parsed) ? parsed : DEFAULT_READING_STREAK
  } catch {
    cache = DEFAULT_READING_STREAK
  }
  emit()
  return cache
}

/** Synchronous read (safe before hydrate — returns the disabled default). */
export function getReadingStreak(): ReadingStreak {
  return cache
}

export function setStreakEnabled(v: boolean): void {
  if (cache.enabled === v) return
  cache = { ...cache, enabled: v }
  emit()
  persist()
}

/**
 * Count today as read. No-op unless enabled; idempotent within a day.
 * Consecutive with yesterday extends the streak, anything else restarts at 1.
 */
export function markReadToday(today: Date = new Date()): void {
  if (!cache.enabled) return
  const todayKey = streakDateKey(today)
  if (cache.lastReadDate === todayKey) return
  const count = cache.lastReadDate === yesterdayKey(today) ? cache.count + 1 : 1
  cache = { ...cache, count, lastReadDate: todayKey }
  emit()
  persist()
}

/**
 * The streak to DISPLAY: the stored count while it is still alive (last read
 * today or yesterday), else 0. Disabled always reads 0.
 */
export function currentStreak(state: ReadingStreak = cache, today: Date = new Date()): number {
  if (!state.enabled || !state.lastReadDate) return 0
  const alive =
    state.lastReadDate === streakDateKey(today) || state.lastReadDate === yesterdayKey(today)
  return alive ? state.count : 0
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Subscribing hook — re-renders on any streak change (Home card + settings). */
export function useReadingStreak(): ReadingStreak {
  return useSyncExternalStore(subscribe, getReadingStreak, getReadingStreak)
}

/** Test-only reset so each test starts from a clean module state. */
export function __resetReadingStreakForTest(): void {
  cache = DEFAULT_READING_STREAK
  storage = null
}
