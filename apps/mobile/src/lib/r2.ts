// Base URL for the Cloudflare R2 bucket that serves the app's remote content:
// Bible chapter JSON, and devotional month artifacts.
//
// Extracted out of bibleSource.ts so the devotional layer can reach it without
// importing bibleSource, which pulls the @gracechords/core barrel (and with it
// the Supabase client). bibleSource re-exports `r2Base` so its existing callers
// are unaffected.

const DEFAULT_R2_PUBLIC_URL = 'https://assets.gracechords.com'

/** Base URL for R2 assets, no trailing slash. Override with EXPO_PUBLIC_R2_PUBLIC_URL. */
export function r2Base(): string {
  const raw = process.env.EXPO_PUBLIC_R2_PUBLIC_URL || DEFAULT_R2_PUBLIC_URL
  return raw.replace(/\/+$/, '')
}
