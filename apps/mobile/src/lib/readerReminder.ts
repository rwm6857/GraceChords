import { useSyncExternalStore } from 'react'
import type { KVStorage } from './defaults'

// Daily Word reminder — an OPT-IN, off-by-default local notification that nudges
// the user to open today's reading at a time they pick. Device-local
// (AsyncStorage), NOT Supabase-synced.
//
// Follows the defaults.ts / readingStreak.ts pattern: storage is INJECTED so the
// module is RN-free and unit-testable headless; the app root hydrates once at
// splash, after which reads are synchronous and `useReaderReminder` re-renders
// subscribers. Native scheduling (expo-notifications) is kept out of this module
// so the preference + reconciliation logic stay testable — see
// readerReminderService.ts for the wiring.

export type ReaderReminder = {
  enabled: boolean
  /** Local hour, 0–23. */
  hour: number
  /** Local minute, 0–59. */
  minute: number
}

export const DEFAULT_READER_REMINDER: ReaderReminder = {
  enabled: false,
  hour: 8,
  minute: 0,
}

const STORAGE_KEY = 'gc.readerReminder.v1'

/** Stable identifier for our single scheduled daily notification, so it can be
 * cancelled/replaced without disturbing anything else the OS has scheduled. */
export const REMINDER_NOTIFICATION_ID = 'reader-daily-reminder'

let cache: ReaderReminder = DEFAULT_READER_REMINDER
let storage: KVStorage | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function persist() {
  storage?.setItem(STORAGE_KEY, JSON.stringify(cache)).catch(() => {})
}

function clampHour(h: number): number {
  if (!Number.isFinite(h)) return DEFAULT_READER_REMINDER.hour
  return Math.min(23, Math.max(0, Math.trunc(h)))
}

function clampMinute(m: number): number {
  if (!Number.isFinite(m)) return DEFAULT_READER_REMINDER.minute
  return Math.min(59, Math.max(0, Math.trunc(m)))
}

function isReaderReminder(v: unknown): v is ReaderReminder {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  return typeof r.enabled === 'boolean' && typeof r.hour === 'number' && typeof r.minute === 'number'
}

/** Load the stored reminder; a bad read falls back to the (disabled) default. */
export async function hydrateReaderReminder(store: KVStorage): Promise<ReaderReminder> {
  storage = store
  try {
    const parsed = JSON.parse((await store.getItem(STORAGE_KEY)) ?? 'null') as unknown
    cache = isReaderReminder(parsed)
      ? { enabled: parsed.enabled, hour: clampHour(parsed.hour), minute: clampMinute(parsed.minute) }
      : DEFAULT_READER_REMINDER
  } catch {
    cache = DEFAULT_READER_REMINDER
  }
  emit()
  return cache
}

/** Synchronous read (safe before hydrate — returns the disabled default). */
export function getReaderReminder(): ReaderReminder {
  return cache
}

export function setReminderEnabled(v: boolean): void {
  if (cache.enabled === v) return
  cache = { ...cache, enabled: v }
  emit()
  persist()
}

export function setReminderTime(hour: number, minute: number): void {
  const h = clampHour(hour)
  const m = clampMinute(minute)
  if (cache.hour === h && cache.minute === m) return
  cache = { ...cache, hour: h, minute: m }
  emit()
  persist()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Subscribing hook — re-renders on any reminder change (Settings screen). */
export function useReaderReminder(): ReaderReminder {
  return useSyncExternalStore(subscribe, getReaderReminder, getReaderReminder)
}

/** Locale-aware "8:00 AM" / "20:00" display for the settings row and picker. */
export function formatReminderTime(hour: number, minute: number, locale?: string): string {
  const d = new Date(2000, 0, 1, clampHour(hour), clampMinute(minute))
  try {
    return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(d)
  } catch {
    return `${String(clampHour(hour)).padStart(2, '0')}:${String(clampMinute(minute)).padStart(2, '0')}`
  }
}

// --- OS scheduling reconciliation (dependency-injected, testable) -----------

export type ReminderContent = { title: string; body: string }

/** Minimal surface of expo-notifications we depend on — injected so the
 * reconciliation logic below can be unit-tested without the native module. */
export type NotificationBackend = {
  /** Whether the app currently holds permission to post notifications. */
  getPermissionGranted(): Promise<boolean>
  /** Prompt the user for permission; resolves to whether it was granted. */
  requestPermission(): Promise<boolean>
  /** Cancel the scheduled notification with this id (no-op if none). */
  cancel(id: string): Promise<void>
  /** Schedule a daily-repeating notification at the given local time. */
  scheduleDaily(
    id: string,
    hour: number,
    minute: number,
    content: ReminderContent,
  ): Promise<void>
}

/**
 * Reconcile the OS-scheduled reminder with the current preference: always clear
 * the existing one first, then (re)schedule the single daily notification when
 * the reminder is enabled AND permission is held. Safe to call repeatedly
 * (launch, toggle, time change, language change).
 */
export async function syncReminder(
  pref: ReaderReminder,
  content: ReminderContent,
  backend: NotificationBackend,
): Promise<void> {
  await backend.cancel(REMINDER_NOTIFICATION_ID)
  if (!pref.enabled) return
  if (!(await backend.getPermissionGranted())) return
  await backend.scheduleDaily(REMINDER_NOTIFICATION_ID, pref.hour, pref.minute, content)
}

/** Test-only reset so each test starts from a clean module state. */
export function __resetReaderReminderForTest(): void {
  cache = DEFAULT_READER_REMINDER
  storage = null
}
