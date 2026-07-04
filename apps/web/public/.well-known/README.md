# `.well-known` — mobile deep-link association files

These static files are served at the site root by Cloudflare Pages
(`https://gracechords.com/.well-known/...`). They let the native GraceChords
apps claim `https://gracechords.com/...` links (iOS Universal Links / Android
App Links) so eligible links open the app instead of the browser. `_headers`
forces `Content-Type: application/json` for both files (Apple/Android require
JSON, served over HTTPS, with no redirect).

## `apple-app-site-association` (iOS — active)
App ID `J7Y8NYZ48Q.com.gracechords.app`. Currently claims only song detail
pages, which map to the app's `viewer/[slug]` screen:

- `/song/*` and `/songs/*` → open in app.
- `/setlist/*`, `/set/*`, `/worship/*` → `exclude: true` (open in web).

### TODO(setlist)
The web "Share Set" button emits *ephemeral* links carrying a slug list + keys
(`/setlist/<slug1>,<slug2>?toKeys=...`, plus `/set/<CODE>` and `/worship/...`).
The app's setlist screens only load personal setlists by Supabase UUID, so they
cannot yet reconstruct an ephemeral set from these links — hence the excludes.
When the app gains a screen that decodes the shared payload (reusing
`packages/core/src/setlists/setcode.js` `decodeSet` against the song catalog),
flip these entries from `exclude: true` to includes.

## `assetlinks.json` (Android — inert scaffold)
### TODO(android)
Wired ahead of an Android release but **inert**: `sha256_cert_fingerprints`
holds a placeholder. No Android app is published, so verification cannot
succeed yet. When an Android signing key exists, replace
`TODO_ANDROID_RELEASE_SHA256_FINGERPRINT` with the release key's SHA-256
fingerprint (e.g. from `keytool -list -v` or the Play Console app-signing page)
and add the same song paths to `android.intentFilters` in
`apps/mobile/app.json`.
