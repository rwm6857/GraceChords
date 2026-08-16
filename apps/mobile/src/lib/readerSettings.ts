import { useSyncExternalStore } from 'react'
import type { KVStorage } from './defaults'

// Daily Word reader typography preferences — text size, typeface, verse layout
// and line spacing.
//
// These used to be `useState` inside DailyWordScreen, so every one of them
// reset the moment the reader was closed. They are readability/comfort
// settings, not a transient view state, so they now persist device-local
// (AsyncStorage) and survive a relaunch or an app update.
//
// Follows the defaults.ts pattern: storage is INJECTED so the module is RN-free
// and unit-testable headless; the app root hydrates once during the splash hold
// (the key rides the launchStorage.ts batch), after which reads are synchronous
// and `useReaderSettings()` re-renders the reader on change.
//
// NOT Supabase-synced — like theme/chord style, this is a per-device choice.

export type Typeface = 'serif' | 'sans'
export type VerseLayout = 'lines' | 'prose'
export type LineSpacing = 'tight' | 'normal' | 'relaxed'

export type ReaderSettings = {
  /** Point size shown in the sheet (12–24). Reading size derives from this. */
  pt: number
  typeface: Typeface
  layout: VerseLayout
  lineSpacing: LineSpacing
}

export const READER_PT_MIN = 12
export const READER_PT_MAX = 24

export const defaultReaderSettings: ReaderSettings = {
  pt: 14,
  typeface: 'serif',
  layout: 'lines',
  lineSpacing: 'normal',
}

const STORAGE_KEY = 'gc.reader.settings.v1'

// Match the web reader's derivations so the two platforms read alike.
const LINE_HEIGHT_MULTIPLIER: Record<LineSpacing, number> = {
  tight: 1.4,
  normal: 1.6,
  relaxed: 1.85,
}

export function readerFontSize(pt: number) {
  return Math.round((pt * 4) / 3)
}

export function readerLineHeight(pt: number, spacing: LineSpacing) {
  return Math.round(readerFontSize(pt) * LINE_HEIGHT_MULTIPLIER[spacing])
}

// ---------------------------------------------------------------------------
// Verse-number metrics
// ---------------------------------------------------------------------------

/** Verse numerals are set smaller than the body text they introduce. */
const VERSE_NUMBER_RATIO = 0.72
/**
 * Extra lift under a verse numeral, as a fraction of the body font size. Small
 * on purpose: wrapping the numeral in an inline box already lifts it by its own
 * descent (see VerseNumber.tsx), and this only tops that up to roughly the body
 * text's cap height. Keeping it small also keeps the numeral's box shorter than
 * the line's ascent, so a line carrying a verse number is never taller than its
 * neighbours at any supported size/spacing pair.
 */
const VERSE_NUMBER_LIFT_RATIO = 0.06

export function verseNumberFontSize(fontSize: number) {
  return Math.round(fontSize * VERSE_NUMBER_RATIO)
}

export function verseNumberLift(fontSize: number) {
  return Math.round(fontSize * VERSE_NUMBER_LIFT_RATIO)
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

let cache: ReaderSettings = defaultReaderSettings
let storage: KVStorage | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function clampPt(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return defaultReaderSettings.pt
  return Math.min(READER_PT_MAX, Math.max(READER_PT_MIN, Math.round(value)))
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

/**
 * Parse a stored payload field-by-field: a corrupt or partially-written record
 * costs the user only the fields that are actually bad, never the whole set.
 */
export function parseReaderSettings(raw: string | null): ReaderSettings {
  if (!raw) return defaultReaderSettings
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return defaultReaderSettings
    const v = parsed as Record<string, unknown>
    return {
      pt: clampPt(v.pt),
      typeface: oneOf(v.typeface, ['serif', 'sans'] as const, defaultReaderSettings.typeface),
      layout: oneOf(v.layout, ['lines', 'prose'] as const, defaultReaderSettings.layout),
      lineSpacing: oneOf(
        v.lineSpacing,
        ['tight', 'normal', 'relaxed'] as const,
        defaultReaderSettings.lineSpacing,
      ),
    }
  } catch {
    return defaultReaderSettings
  }
}

/**
 * Load the stored settings into the cache and remember `store` for
 * write-through. A bad read never crashes the app — it falls back to defaults.
 */
export async function hydrateReaderSettings(store: KVStorage): Promise<ReaderSettings> {
  storage = store
  try {
    cache = parseReaderSettings(await store.getItem(STORAGE_KEY))
  } catch {
    cache = defaultReaderSettings
  }
  emit()
  return cache
}

/** Synchronous read of the current reader settings. */
export function getReaderSettings(): ReaderSettings {
  return cache
}

/** Persist a settings change made in the reader's text-options sheet. */
export function setReaderSettings(next: ReaderSettings): void {
  const value: ReaderSettings = {
    pt: clampPt(next.pt),
    typeface: oneOf(next.typeface, ['serif', 'sans'] as const, defaultReaderSettings.typeface),
    layout: oneOf(next.layout, ['lines', 'prose'] as const, defaultReaderSettings.layout),
    lineSpacing: oneOf(
      next.lineSpacing,
      ['tight', 'normal', 'relaxed'] as const,
      defaultReaderSettings.lineSpacing,
    ),
  }
  if (
    value.pt === cache.pt &&
    value.typeface === cache.typeface &&
    value.layout === cache.layout &&
    value.lineSpacing === cache.lineSpacing
  ) {
    return
  }
  cache = value
  emit()
  storage?.setItem(STORAGE_KEY, JSON.stringify(value)).catch(() => {})
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Subscribing hook — the reader's typography settings, re-rendering on change. */
export function useReaderSettings(): ReaderSettings {
  return useSyncExternalStore(subscribe, getReaderSettings, getReaderSettings)
}

/** Test-only reset so each test starts from a clean module state. */
export function __resetReaderSettingsForTest(): void {
  cache = defaultReaderSettings
  storage = null
}
