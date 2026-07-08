import { useSyncExternalStore } from 'react'
import {
  normalizeBibleTranslationId,
  resolveBibleTranslationSelection,
  type BibleTranslation,
} from '@gracechords/core'

// The user's explicitly-chosen Bible translation, persisted device-local
// (AsyncStorage), INDEPENDENT of the app UI language. Follows the same injected-
// KVStorage / hydrate-once / useSyncExternalStore pattern as src/lib/defaults.ts
// so it's RN-free and unit-testable headless. Empty string = "no prior choice"
// → the reader seeds a default from the app locale (see defaultTranslationForLocale).

export type KVStorage = {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

const STORAGE_KEY = 'gc.bible.translation.v1'

let cache = ''
let storage: KVStorage | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

/** Load the stored translation id into the cache (empty when unset). */
export async function hydrateBibleTranslationPref(store: KVStorage): Promise<string> {
  storage = store
  let value = ''
  try {
    const raw = await store.getItem(STORAGE_KEY)
    if (typeof raw === 'string' && raw.trim()) value = normalizeBibleTranslationId(raw)
  } catch {
    // Best-effort — a bad read must never crash the app.
  }
  cache = value
  emit()
  return cache
}

/** Synchronous read of the stored pick ('' when the user hasn't chosen). */
export function getBibleTranslationPref(): string {
  return cache
}

/** Persist the user's explicit translation pick. */
export function setBibleTranslationPref(id: string): void {
  const next = normalizeBibleTranslationId(id)
  if (cache === next) return
  cache = next
  emit()
  storage?.setItem(STORAGE_KEY, next).catch(() => {})
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Subscribing hook — re-renders the reader when the stored pick changes. */
export function useBibleTranslationPref(): string {
  return useSyncExternalStore(subscribe, getBibleTranslationPref, getBibleTranslationPref)
}

/** 'ko-KR' / 'en_US' → 'ko' / 'en'. */
function baseLanguage(tag: unknown): string {
  return String(tag ?? '')
    .trim()
    .toLowerCase()
    .split(/[-_]/)[0]
}

/**
 * The default Bible translation id for an app locale when the user has made no
 * explicit pick. Resolution order:
 *   1. The first manifest translation whose base language matches `locale`
 *      (so a Turkish translation added to the manifest later is picked up
 *      automatically — nothing here hardcodes a locale→id map).
 *   2. Otherwise fall through to core's resolver (manifest default → ESV →
 *      first available). A Turkish locale with no Turkish translation lands on
 *      ESV today, by design.
 * UI language and Bible translation stay independent — this only SEEDS the
 * default; a stored pick always wins upstream.
 */
export function defaultTranslationForLocale(
  locale: string,
  translations: BibleTranslation[],
  manifestDefaultId: string
): string {
  const base = baseLanguage(locale)
  if (base) {
    const match = translations.find((tr) => baseLanguage(tr.language) === base)
    if (match) return match.id
  }
  return resolveBibleTranslationSelection('', translations, manifestDefaultId)
}
