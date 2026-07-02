// Staleness check for a downloaded translation vs the current remote manifest.
// Bible text is effectively immutable, so this is conservative: it only reports
// stale when BOTH versions are known and differ. An empty version on either side
// (older download predating versioning, or a manifest that omits `version`) is
// treated as fresh so working offline copies are never force-re-downloaded.

export function isTranslationStale(localVersion: string, remoteVersion: string): boolean {
  if (!remoteVersion) return false
  if (!localVersion) return false
  return localVersion !== remoteVersion
}
