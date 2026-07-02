import type { BibleTranslation } from '@gracechords/core'
import type { KVStorage } from '../types'
import type { FetchLike } from '../downloader'

// Shared fakes for the offline-download harness. Not a *.test.ts file, so vitest
// imports it without treating it as a suite.

export function memoryStorage(
  initial: Record<string, string> = {}
): KVStorage & { store: Map<string, string> } {
  const store = new Map(Object.entries(initial))
  return {
    store,
    getItem: async (k) => store.get(k) ?? null,
    setItem: async (k, v) => void store.set(k, v),
    removeItem: async (k) => void store.delete(k),
  }
}

export const TEST_TRANSLATION: BibleTranslation = {
  id: 'esv',
  label: 'ESV',
  name: 'English Standard Version',
  language: 'English',
  dataRoot: 'bible/en/esv',
}

export function chapterJson(bookNumber: number, chapter: number): string {
  return JSON.stringify({
    bookNumber,
    book: 'Genesis',
    chapter,
    verses: { '1': `book ${bookNumber} chapter ${chapter} verse 1` },
  })
}

/** A fetch that serves chapter JSON for every request. */
export function okFetch(): FetchLike {
  return async () => ({ ok: true, status: 200, text: async () => chapterJson(1, 1) })
}
