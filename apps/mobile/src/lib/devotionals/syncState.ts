import AsyncStorage from '@react-native-async-storage/async-storage'
import { emptySyncState, parseSyncState } from '@gracechords/core/devotional/manifest'
import type { SyncState } from '@gracechords/core/devotional/types'

// Persisted record of what the device has cached: when the manifest was last
// checked, and the hash of each cached month. Follows readingStreak.ts's pattern
// — hydrated once, held in memory, written back fire-and-forget — so a read never
// awaits storage.

const STORAGE_KEY = 'gc.devotionals.sync.v1'

let cache: SyncState = emptySyncState()
let hydrated: Promise<SyncState> | null = null

/** Load persisted state once per app session. Never rejects. */
export function hydrateSyncState(): Promise<SyncState> {
  if (!hydrated) {
    hydrated = AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        cache = parseSyncState(raw ? (JSON.parse(raw) as unknown) : null)
        return cache
      })
      .catch(() => {
        cache = emptySyncState()
        return cache
      })
  }
  return hydrated
}

/** The in-memory state. Valid only after `hydrateSyncState()` has resolved. */
export function syncStateSnapshot(): SyncState {
  return cache
}

/** Replace and persist. Storage failures are swallowed: sync is best-effort. */
export function putSyncState(next: SyncState): void {
  cache = next
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {})
}
