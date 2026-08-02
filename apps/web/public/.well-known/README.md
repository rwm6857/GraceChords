# `.well-known` — mobile deep-link association files

These static files are served at the site root by Cloudflare Pages
(`https://gracechords.com/.well-known/...`). They let the native GraceChords
apps claim `https://gracechords.com/...` links (iOS Universal Links / Android
App Links) so eligible links open the app instead of the browser. `_headers`
forces `Content-Type: application/json` for both files (Apple/Android require
JSON, served over HTTPS, with no redirect).

## The claim table
These three files must agree, and are the whole mechanism — there is no Smart
App Banner meta tag. Safari renders its native "Open in the GraceChords app"
banner for any claimed URL on its own, which is why an unclaimed page shows no
banner at all.

| Web path | App destination |
|---|---|
| `/` | home tab |
| `/songs` | songs tab |
| `/song/*`, `/songs/*` | `viewer/[slug]` |
| `/setlist` | setlists tab (web singular, app plural) |
| `/setlist/*` | `setlist/import` |
| `/set/*` | `setlist/import` |
| `/worship` | setlists tab |
| `/worship/*`, `/worship/set/*` | `setlist/import` |
| `/s/*` | `session/[code]` |
| `/reading` | daily tab |
| `/songbook` | `songbook` |
| `/about` | `about` |
| `/profile` | `settings` (the app has no `/profile` route) |
| `/posts`, `/posts/*` | home tab (blog — no app parallel) |

Paths are **enumerated, never wildcarded across the domain**: Android App Links
have no exclusion mechanism, so enumerating is the only way the two platforms
can stay in sync, and a future web-only page is not silently swallowed by the
app.

**Deliberately never claimed** — `/login`, `/signup`, `/auth/callback`,
`/forgot-password`, `/reset-password` (claiming these would pull Supabase OAuth
redirects and password-reset emails out of the browser mid-flow); `/admin`,
`/editor`, `/portal/*` (role-gated browser tooling); `/privacy`, `/terms`,
`/licenses`, `/delete-account` (the mobile About/Settings screens link *out* to
these, so claiming them would bounce a user app → Safari → app home);
`/bundle`; `/beta`; `/api/*`; `/.well-known/*`; static assets.

## `apple-app-site-association` (iOS — active)
App ID `J7Y8NYZ48Q.com.gracechords.app`. One `components` entry per row above;
patterns are exact unless they end in `*`.

Shared setlists have no direct app parallel — the web link is an ephemeral
payload, so every form lands on the import preview (`setlist/import`), which
decodes it, previews the resolved songs, and saves the user a copy. The web
"Share Set" button emits the slug-list form
(`/setlist/<slug1>,<slug2>?toKeys=...`); the compact `/set/<CODE>` and
`/worship/set/<CODE>` forms decode through
`packages/core/src/setlists/setcode.js` `decodeSet`. When the app isn't
installed, every claimed path opens the web app as usual (Universal Links
fallback).

`ios.associatedDomains` is unchanged by path edits, so **adding a path here
needs no new iOS build** — only a web deploy. Devices cache the AASA, so an
existing install picks up new paths on Apple's refresh cycle or immediately on
reinstall.

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

Every path in the claim table must also be present in `android.intentFilters`
in `apps/mobile/app.json` — `path` for exact routes, `pathPrefix` for the `*`
rows. The home row carries both `path: "/"` and `pathPattern: "/*"` because
Android's `Uri.getPath()` returns `""` (not `"/"`) for a bare
`https://gracechords.com`. Unlike iOS, **Android needs a fresh native build**
(`npx expo prebuild` + EAS) for an intent-filter change — the filters are
compiled into `AndroidManifest.xml`.

The web→route mapping both platforms feed into lives in
`apps/mobile/src/lib/deepLinks.ts` (unit-tested; `apps/mobile/app/+native-intent.tsx`
is a thin wrapper over it).
