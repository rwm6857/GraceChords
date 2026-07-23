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

## `assetlinks.json` (Android — active)
Package `com.gracechords.app`. Declares the Digital Asset Links statements
that let the app claim `https://gracechords.com/...` links (App Links) and
autofill saved credentials:

- `delegate_permission/common.handle_all_urls` — verified App Links.
- `delegate_permission/common.get_login_creds` — Credential Manager /
  Smart Lock login-credential sharing.

`sha256_cert_fingerprints` lists both accepted release-key SHA-256
fingerprints (e.g. from `keytool -list -v` or the Play Console app-signing
page); keep them in sync with the keys actually used to sign shipping builds.
The claimed song/setlist paths must also be present in
`android.intentFilters` in `apps/mobile/app.json`.
