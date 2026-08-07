import type { Reflection } from '@gracechords/core'
import type { KVStorage } from './defaults'

// The signed-in user's reflection for a single day, cached so the Daily Word
// landing does not re-answer a question it has already answered.
//
// Before this store, the landing showed a spinner on every focus: its
// useFocusEffect called a refresh that unconditionally set loading=true, so a
// known answer was discarded and refetched several times a day. Here the answer
// is kept, and a refetch happens behind the rendered card.
//
// Follows the defaults.ts / readingStreak.ts pattern: module-level cache,
// subscriber set for useSyncExternalStore, INJECTED storage so the module is
// RN-free and unit-tests headless. The network read is NOT here — it stays in
// useReflections.ts, which is what keeps this file free of the supabase client
// (and therefore of react-native).
//
// KEYED BY USER, which is load-bearing. fetchReflectionForDate has no user_id
// filter: it relies on RLS to scope rows to the caller. A cache keyed by date
// alone would therefore hand one account's private reflection to the next
// account signed in on the same device.

/**
 * A resolved day. `reflection: null` means "we read, and there is none" — which
 * is a real answer and distinct from an absent entry ("never read"). The landing
 * depends on that distinction: it may only show the compose CTA when it knows
 * the day is empty, because prompting a second same-day write is rejected by the
 * one-per-day unique index.
 */
export type ReflectionDay = {
  userId: string | null
  date: string
  reflection: Reflection | null
}

type PersistedDay = { userId: string; date: string; reflection: Reflection | null }

const STORAGE_KEY = 'gc.reflection.today.v1'

const memory = new Map<string, ReflectionDay>()
const listeners = new Set<() => void>()
let storage: KVStorage | null = null

/** Signed-out reads still cache (RLS returns nothing) but never persist. */
const ANON = 'anon'

function emit() {
  for (const l of listeners) l()
}

/** Local-time day key (YYYY-MM-DD) — reflections follow the user's calendar day. */
export function reflectionDateKey(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export function reflectionCacheKey(userId: string | null, date: string): string {
  return `${userId ?? ANON}|${date}`
}

function isReflection(v: unknown): v is Reflection {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  return (
    typeof r.id === 'string' &&
    typeof r.body === 'string' &&
    typeof r.reflection_date === 'string'
  )
}

function isPersistedDay(v: unknown): v is PersistedDay {
  if (!v || typeof v !== 'object') return false
  const d = v as Record<string, unknown>
  return (
    typeof d.userId === 'string' &&
    typeof d.date === 'string' &&
    (d.reflection === null || isReflection(d.reflection))
  )
}

/**
 * Persist the day so a cold launch paints it on the first frame.
 *
 * ONLY TODAY IS WRITTEN, and to a single key. The landing can only ever open on
 * today, so one entry is all a cold launch can use — and storing one means a new
 * day overwrites the old one instead of accumulating entries that would then
 * need pruning. An older day (the journal editing a past entry) stays in memory
 * for the session and is simply not written.
 */
function persist(day: ReflectionDay, now: Date): void {
  if (!day.userId) return
  if (day.date !== reflectionDateKey(now)) return
  const payload: PersistedDay = { userId: day.userId, date: day.date, reflection: day.reflection }
  storage?.setItem(STORAGE_KEY, JSON.stringify(payload)).catch(() => {})
}

/**
 * Load the persisted day into memory. Called once from the splash join.
 *
 * Ordering against the session read does not matter: the stored blob names its
 * own owner, so it lands under that user's key and is only ever found by a
 * lookup for that same user. A blob from an earlier day is dropped rather than
 * seeded — it would only be a stale answer to today's question.
 */
export async function hydrateTodayReflection(
  store: KVStorage,
  now: Date = new Date(),
): Promise<void> {
  storage = store
  try {
    const parsed = JSON.parse((await store.getItem(STORAGE_KEY)) ?? 'null') as unknown
    if (!isPersistedDay(parsed)) return
    if (parsed.date !== reflectionDateKey(now)) return
    memory.set(reflectionCacheKey(parsed.userId, parsed.date), {
      userId: parsed.userId,
      date: parsed.date,
      reflection: parsed.reflection,
    })
    emit()
  } catch {
    // Best-effort: a bad read just means the first open fetches, as it used to.
  }
}

/**
 * The cached day, or undefined if it has never been read.
 *
 * Reference-stable between writes, which useSyncExternalStore requires of
 * getSnapshot — the entry object is replaced, never mutated.
 */
export function getReflectionDay(key: string): ReflectionDay | undefined {
  return memory.get(key)
}

/** Record a resolved day and notify subscribers. */
export function setReflectionDay(
  userId: string | null,
  date: string,
  reflection: Reflection | null,
  now: Date = new Date(),
): void {
  const day: ReflectionDay = { userId, date, reflection }
  memory.set(reflectionCacheKey(userId, date), day)
  emit()
  persist(day, now)
}

/**
 * Apply a journal edit or delete to whichever cached day holds that row.
 *
 * The journal (useReflectionList) owns its own copy of the rows, so without this
 * a delete there would leave the landing painting the deleted entry from cache
 * until its background refetch landed. Passing `null` records the day as empty,
 * which is a known answer — so the landing correctly shows the compose CTA.
 */
export function applyReflectionRowChange(id: string, next: Reflection | null, now: Date = new Date()): void {
  let changed = false
  for (const [key, day] of memory) {
    if (day.reflection?.id !== id) continue
    const updated: ReflectionDay = { ...day, reflection: next }
    memory.set(key, updated)
    persist(updated, now)
    changed = true
  }
  if (changed) emit()
}

/**
 * Drop everything, including the persisted copy. Called on sign-out: a
 * reflection is private journal text, and caching it to disk is only defensible
 * if signing out takes it back off again.
 */
export function clearReflectionDays(): void {
  memory.clear()
  emit()
  storage?.removeItem(STORAGE_KEY).catch(() => {})
}

export function subscribeReflectionDays(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Test-only reset so each test starts from a clean module state. */
export function __resetReflectionDayStoreForTest(): void {
  memory.clear()
  listeners.clear()
  storage = null
}
