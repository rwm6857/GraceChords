# Offline downloads

Settings → `OfflineDownloadsScreen` (`app/offline.tsx`). Users save a **whole
Bible translation** for offline reading. Song/setlist offline persistence does
not exist.

- Every chapter is enumerated up front from core's `BOOK_CHAPTER_COUNTS`
  (`packages/core/src/bible/chapterCounts.ts`), fetched from R2, and written as
  on-device blobs (`expo-file-system`).
- The pure logic (`downloader`, `manifest`, `resolver`, `staleness`) is
  **dependency-injected** and unit-tested headless with `memoryBlobStore`;
  `service.ts` wires the real `expoBlobStore` + `fetch` + `expo-network`.
- State is a manifest (`gc.downloads.v1`, the injected-storage /
  `useSyncExternalStore` pattern): completed downloads keyed by translation id,
  plus a **Wi-Fi only** preference enforced via `expo-network`
  (`WifiRequiredError`).
- Downloads report progress, cancel via `AbortToken`, retry transient failures
  with backoff, and delete **locally only** (never touch Supabase).
- `getPassage` in `../bibleSource.ts` reads a downloaded chapter before R2.
  Staleness compares the stored translation `version` with the live manifest.
- User-chosen downloads are **not** subject to `cacheBudget.ts` eviction — that
  budget is only for caches the app fills on its own.
