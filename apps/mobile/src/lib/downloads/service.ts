import * as Network from 'expo-network'
import type { BibleTranslation } from '@gracechords/core'
import { getTranslations, r2Base } from '../bibleSource'
import { expoBlobStore } from './expoBlobStore'
import { downloadBibleTranslation } from './downloader'
import { getDownloadsSnapshot, removeDownload, upsertDownload } from './manifest'
import { translationDirRel } from './paths'
import type { AbortToken, BibleDownload, DownloadProgress } from './types'

// App-facing download controller. Wires the pure downloader/manifest to the real
// device: expo-file-system blobs, the global fetch, and expo-network for the
// "Wi-Fi only" preference. Kept thin — all logic lives in the pure modules.

export class WifiRequiredError extends Error {
  constructor() {
    super('wifi_required')
    this.name = 'WifiRequiredError'
  }
}

async function connectionAllowed(wifiOnly: boolean): Promise<boolean> {
  if (!wifiOnly) return true
  try {
    const state = await Network.getNetworkStateAsync()
    return state.type === Network.NetworkStateType.WIFI || state.type === Network.NetworkStateType.ETHERNET
  } catch {
    // If we can't tell, don't block the user.
    return true
  }
}

/**
 * Download a whole translation for offline use. Enforces the Wi-Fi-only
 * preference, captures the current manifest version for staleness, and records
 * the completed download. Throws WifiRequiredError, DownloadCancelledError, or a
 * network error (nothing is recorded on failure).
 */
export async function startBibleDownload(
  translation: BibleTranslation,
  opts: { onProgress?: (p: DownloadProgress) => void; signal?: AbortToken } = {}
): Promise<BibleDownload> {
  const { wifiOnly } = getDownloadsSnapshot()
  if (!(await connectionAllowed(wifiOnly))) throw new WifiRequiredError()

  const { version } = await getTranslations()
  const record = await downloadBibleTranslation(translation, version, r2Base(), {
    blobStore: expoBlobStore,
    fetchImpl: (url) => fetch(url),
    onProgress: opts.onProgress,
    signal: opts.signal,
  })
  upsertDownload(record)
  return record
}

/** Delete a downloaded translation — LOCAL ONLY: removes the manifest record and
 * the on-device blob tree. Bibles are not stored in Supabase, so this can never
 * touch any song/setlist record or other user data. */
export async function deleteBibleDownload(id: string): Promise<void> {
  const record = removeDownload(id)
  if (record) await expoBlobStore.deleteDir(translationDirRel(record.dataRoot))
}
