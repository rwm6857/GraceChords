// Offline-download layer for Bible translations. Device-local (expo-file-system
// blobs + a JSON manifest via AsyncStorage), NOT Supabase-synced. The pure logic
// (manifest, downloader, resolver, staleness) is injected-dependency based so it
// unit-tests headless; service.ts wires the real device impls.

export * from './types'
export * from './manifest'
export * from './resolver'
export * from './staleness'
export * from './downloader'
export * from './service'
export { expoBlobStore } from './expoBlobStore'
export {
  chapterRelPath,
  translationDirRel,
  tmpDirRel,
  tmpChapterRelPath,
  TMP_ROOT,
} from './paths'
