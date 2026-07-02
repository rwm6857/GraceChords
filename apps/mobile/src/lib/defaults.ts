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

export type AppDefaults = {
  theme: ThemePref
  chordStyle: ChordStyle
}

export const DEFAULT_APP_DEFAULTS: AppDefaults = {
  theme: 'system',
  chordStyle: 'letters',
}

const THEME_KEY = 'gc.defaults.theme'
const CHORD_STYLE_KEY = 'gc.defaults.chordStyle'

const THEME_PREFS: readonly ThemePref[] = ['system', 'light', 'dark']
const CHORD_STYLES: readonly ChordStyle[] = ['letters', 'solfege']

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

/**
 * Load stored defaults into the cache and remember `store` for write-through.
 * Missing/invalid values fall back to DEFAULT_APP_DEFAULTS. Safe to call again
 * to re-read from the same storage (used to simulate a reload in tests).
 */
export async function hydrateDefaults(store: KVStorage): Promise<AppDefaults> {
  storage = store
  let theme: ThemePref = DEFAULT_APP_DEFAULTS.theme
  let chordStyle: ChordStyle = DEFAULT_APP_DEFAULTS.chordStyle
  try {
    const [rawTheme, rawChord] = await Promise.all([
      store.getItem(THEME_KEY),
      store.getItem(CHORD_STYLE_KEY),
    ])
    if (isThemePref(rawTheme)) theme = rawTheme
    if (isChordStyle(rawChord)) chordStyle = rawChord
  } catch {
    // Best-effort — a bad read must never crash the app; fall back to defaults.
  }
  cache = { theme, chordStyle }
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
