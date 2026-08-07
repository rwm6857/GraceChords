import * as Crypto from 'expo-crypto'
import { parseManifest, parseMonthFile } from '@gracechords/core/devotional/manifest'
import type { Manifest, MonthFile } from '@gracechords/core/devotional/types'
import { r2Base } from '../r2'
import { manifestUrl, monthUrl } from './paths'

// Network layer for devotional content. Every function here resolves to null on
// ANY failure — offline, timeout, non-200, malformed JSON, hash mismatch. There
// is no bundled baseline to fall back to, so a failure means the feature stays
// empty rather than showing something wrong, and it is never surfaced as an
// error: the devotional is supplementary and must not disturb Daily Word.

/** Give up rather than hold a request open indefinitely on a bad network. */
const FETCH_TIMEOUT_MS = 15_000

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Hex SHA-256 of a string, matching the exporter's hash of the file's bytes. */
export async function sha256Hex(text: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text, {
    encoding: Crypto.CryptoEncoding.HEX,
  })
}

export type FetchedManifest = { manifest: Manifest, text: string }

/** Fetch and validate the manifest. Null on any failure. */
export async function fetchManifest(base = r2Base()): Promise<FetchedManifest | null> {
  const text = await fetchText(manifestUrl(base))
  if (!text) return null
  try {
    const manifest = parseManifest(JSON.parse(text) as unknown)
    return manifest ? { manifest, text } : null
  } catch {
    return null
  }
}

export type FetchedMonth = { month: MonthFile, text: string }

/**
 * Fetch one month and verify it against the manifest hash.
 *
 * A month whose bytes do not hash to the manifest's value is DISCARDED — the
 * previous cached copy is left in place. Without this a truncated or
 * man-in-the-middled response would become the device's only copy of that month.
 */
export async function fetchMonth(
  file: string,
  expectedHash: string,
  base = r2Base()
): Promise<FetchedMonth | null> {
  const text = await fetchText(monthUrl(base, file))
  if (!text) return null

  const actual = await sha256Hex(text)
  if (actual !== expectedHash) {
    if (__DEV__) {
      console.warn(`[devotionals] hash mismatch for ${file}: expected ${expectedHash}, got ${actual}`)
    }
    return null
  }

  try {
    const month = parseMonthFile(JSON.parse(text) as unknown)
    return month ? { month, text } : null
  } catch {
    return null
  }
}
