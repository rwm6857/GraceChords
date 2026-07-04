# `.well-known` — mobile deep-link association files

These static files are served at the site root by Cloudflare Pages
(`https://gracechords.com/.well-known/...`). They let the native GraceChords
apps claim `https://gracechords.com/...` links (iOS Universal Links / Android
App Links) so eligible links open the app instead of the browser. `_headers`
forces `Content-Type: application/json` for both files (Apple/Android require
JSON, served over HTTPS, with no redirect).

## `apple-app-site-association` (iOS — active)
App ID `J7Y8NYZ48Q.com.gracechords.app`. Claims:

- `/song/*` and `/songs/*` → app song viewer (`viewer/[slug]`).
- `/setlist/*`, `/set/*`, `/worship/*` → app shared-setlist import preview
  (`setlist/import`), which decodes the shared payload, previews the resolved
  songs, and saves the user a copy. The web "Share Set" button emits the
  ephemeral slug-list form (`/setlist/<slug1>,<slug2>?toKeys=...`); the compact
  `/set/<CODE>` and `/worship/set/<CODE>` forms decode through
  `packages/core/src/setlists/setcode.js` `decodeSet`. When the app isn't
  installed these paths open the web app as usual (Universal Links fallback).

## `assetlinks.json` (Android — inert scaffold)
### TODO(android)
Wired ahead of an Android release but **inert**: `sha256_cert_fingerprints`
holds a placeholder. No Android app is published, so verification cannot
succeed yet. When an Android signing key exists, replace
`TODO_ANDROID_RELEASE_SHA256_FINGERPRINT` with the release key's SHA-256
fingerprint (e.g. from `keytool -list -v` or the Play Console app-signing page)
and add the same song paths to `android.intentFilters` in
`apps/mobile/app.json`.
