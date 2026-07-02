// Shared types for the offline-download layer. Device-local only — NOT
// Supabase-synced. Kept DOM/RN-free so the logic (manifest, downloader,
// resolver, staleness) unit-tests headless with injected deps.

/** AsyncStorage-shaped key/value store — the same shape as defaults.ts/profile.ts. */
export type KVStorage = {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

/**
 * Filesystem boundary the downloader/resolver call into. All paths are RELATIVE
 * to a single base directory (the app document dir in production). Abstracted so
 * the logic is native-free and testable with an in-memory implementation
 * (native modules are injected deps, never mocked).
 */
export type BlobStore = {
  exists(relPath: string): Promise<boolean>
  readText(relPath: string): Promise<string>
  writeText(relPath: string, text: string): Promise<void>
  deleteDir(relPath: string): Promise<void>
  /** Move a directory to `toRel`, replacing any existing dir there (atomic finalize). */
  moveDir(fromRel: string, toRel: string): Promise<void>
  /** Recursive size of a directory in bytes; 0 when it does not exist. */
  dirSizeBytes(relPath: string): Promise<number>
}

/** One downloaded translation. Only COMPLETE downloads are ever recorded. */
export type BibleDownload = {
  id: string
  type: 'bible'
  dataRoot: string
  label: string
  name: string
  language: string
  /** Manifest version captured at download time (staleness comparison). */
  version: string
  sizeBytes: number
  chapterCount: number
  downloadedAt: string
  status: 'complete'
}

export type DownloadProgress = { done: number; total: number }

/** Cooperative cancel token — the downloader checks `aborted` between chapters. */
export type AbortToken = { aborted: boolean }

/** Thrown by the downloader when a cancel token trips mid-download. */
export class DownloadCancelledError extends Error {
  constructor() {
    super('download_cancelled')
    this.name = 'DownloadCancelledError'
  }
}
