import { useSyncExternalStore } from 'react'
import type { ThemeMode } from '@gracechords/tokens/native'

// App-wide defaults — the theme and chord-style preferences the Settings screen
// writes and the Song Viewer / Performer / Daily Word read. Device-local
// (AsyncStorage), NOT Supabase-synced and NOT the Stage-3 asset layer.
//
// Storage is INJECTED (a KVStorage, same shape as profile.ts) so this module is
// DOM/RN-free and unit-testable headless. The app root calls hydrateDefaults()
// once with AsyncStorage during the splash hold; after that getDefaultsSnapshot()
// is synchronous, so screens seed their initial state on open with no flash.

export type KVStorage = {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

/** 'system' follows the OS scheme (today's behavior); light/dark force a mode. */
export type ThemePref = 'system' | 'light' | 'dark'
/** Chord token spelling. Structurally identical to ChordChart's ChordStyle. */
export type ChordStyle = 'letters' | 'solfege'
/** What the Daily Word tab opens: the landing hub, or straight to the Reader. */
export type DailyWordDestination = 'landing' | 'reader'

export type AppDefaults = {
  theme: ThemePref
  chordStyle: ChordStyle
  /** Keep the screen awake in the Song Viewer / Performer (default off). */
  keepAwake: boolean
  /** UI language override (locale code). null = follow the device language. */
  language: string | null
  /** Daily Word tab entry point (default 'landing'). */
  dailyWordDestination: DailyWordDestination
}

export const DEFAULT_APP_DEFAULTS: AppDefaults = {
  theme: 'system',
  chordStyle: 'letters',
  keepAwake: false,
  language: null,
  dailyWordDestination: 'landing',
}

const THEME_KEY = 'gc.defaults.theme'
const CHORD_STYLE_KEY = 'gc.defaults.chordStyle'
const KEEP_AWAKE_KEY = 'gc.defaults.keepAwake'
const LANGUAGE_KEY = 'gc.defaults.language'
const DAILY_WORD_DESTINATION_KEY = 'gc.defaults.dailyWordDestination'

const THEME_PREFS: readonly ThemePref[] = ['system', 'light', 'dark']
const CHORD_STYLES: readonly ChordStyle[] = ['letters', 'solfege']
const DAILY_WORD_DESTINATIONS: readonly DailyWordDestination[] = ['landing', 'reader']

// Module-level cache + write-through storage. `cache` is replaced with a NEW
// object on every change so useSyncExternalStore sees a stable reference between
// changes (required — getSnapshot must not return a fresh object each call).
let cache: AppDefaults = DEFAULT_APP_DEFAULTS
let storage: KVStorage | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function isThemePref(v: unknown): v is ThemePref {
  return typeof v === 'string' && (THEME_PREFS as readonly string[]).includes(v)
}
function isChordStyle(v: unknown): v is ChordStyle {
  return typeof v === 'string' && (CHORD_STYLES as readonly string[]).includes(v)
}
function isDailyWordDestination(v: unknown): v is DailyWordDestination {
  return typeof v === 'string' && (DAILY_WORD_DESTINATIONS as readonly string[]).includes(v)
}

/**
 * Load stored defaults into the cache and remember `store` for write-through.
 * Missing/invalid values fall back to DEFAULT_APP_DEFAULTS. Safe to call again
 * to re-read from the same storage (used to simulate a reload in tests).
 */
export async function hydrateDefaults(store: KVStorage): Promise<AppDefaults> {
  storage = store
  let theme: ThemePref = DEFAULT_APP_DEFAULTS.theme
  let chordStyle: ChordStyle = DEFAULT_APP_DEFAULTS.chordStyle
  let keepAwake: boolean = DEFAULT_APP_DEFAULTS.keepAwake
  let language: string | null = DEFAULT_APP_DEFAULTS.language
  let dailyWordDestination: DailyWordDestination = DEFAULT_APP_DEFAULTS.dailyWordDestination
  try {
    const [rawTheme, rawChord, rawKeepAwake, rawLanguage, rawDailyWord] = await Promise.all([
      store.getItem(THEME_KEY),
      store.getItem(CHORD_STYLE_KEY),
      store.getItem(KEEP_AWAKE_KEY),
      store.getItem(LANGUAGE_KEY),
      store.getItem(DAILY_WORD_DESTINATION_KEY),
    ])
    if (isThemePref(rawTheme)) theme = rawTheme
    if (isChordStyle(rawChord)) chordStyle = rawChord
    if (rawKeepAwake != null) keepAwake = rawKeepAwake === '1'
    // Validated against the supported-locale list at resolution time
    // (src/i18n/config.ts resolveLanguage), not here — the folders can change.
    if (typeof rawLanguage === 'string' && rawLanguage.trim()) language = rawLanguage.trim()
    if (isDailyWordDestination(rawDailyWord)) dailyWordDestination = rawDailyWord
  } catch {
    // Best-effort — a bad read must never crash the app; fall back to defaults.
  }
  cache = { theme, chordStyle, keepAwake, language, dailyWordDestination }
  emit()
  return cache
}

/** Synchronous read of the current defaults (safe before hydrate — returns fallbacks). */
export function getDefaultsSnapshot(): AppDefaults {
  return cache
}

export function setDefaultTheme(v: ThemePref): void {
  if (cache.theme === v) return
  cache = { ...cache, theme: v }
  emit()
  storage?.setItem(THEME_KEY, v).catch(() => {})
}

export function setDefaultChordStyle(v: ChordStyle): void {
  if (cache.chordStyle === v) return
  cache = { ...cache, chordStyle: v }
  emit()
  storage?.setItem(CHORD_STYLE_KEY, v).catch(() => {})
}

/** Persist the UI-language override; null = follow the device language. */
export function setDefaultLanguage(v: string | null): void {
  if (cache.language === v) return
  cache = { ...cache, language: v }
  emit()
  if (v == null) storage?.removeItem(LANGUAGE_KEY).catch(() => {})
  else storage?.setItem(LANGUAGE_KEY, v).catch(() => {})
}

export function setDefaultKeepAwake(v: boolean): void {
  if (cache.keepAwake === v) return
  cache = { ...cache, keepAwake: v }
  emit()
  storage?.setItem(KEEP_AWAKE_KEY, v ? '1' : '0').catch(() => {})
}

/** Persist what the Daily Word tab opens: the landing hub or the Reader. */
export function setDefaultDailyWordDestination(v: DailyWordDestination): void {
  if (cache.dailyWordDestination === v) return
  cache = { ...cache, dailyWordDestination: v }
  emit()
  storage?.setItem(DAILY_WORD_DESTINATION_KEY, v).catch(() => {})
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Subscribing hook — re-renders on any defaults change (Settings + ThemeProvider). */
export function useAppDefaults(): AppDefaults {
  return useSyncExternalStore(subscribe, getDefaultsSnapshot, getDefaultsSnapshot)
}

/**
 * Resolve a theme preference against the OS scheme to a concrete token mode.
 * `systemScheme` is loosely typed to accept RN's ColorSchemeName
 * ('light' | 'dark' | 'unspecified' | null | undefined).
 */
export function resolveThemeMode(pref: ThemePref, systemScheme: string | null | undefined): ThemeMode {
  if (pref === 'light' || pref === 'dark') return pref
  return systemScheme === 'dark' ? 'dark' : 'light'
}

/** Viewer/Performer initial chord style on open (read-on-open, session-local). */
export function initialChordStyle(defaults: AppDefaults): ChordStyle {
  return defaults.chordStyle
}
