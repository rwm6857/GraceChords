# Monorepo migration — status & remaining steps

This repo is being restructured into an npm-workspaces monorepo so a future Expo
(React Native) iOS app can share core logic with the web app. The web app still
builds and deploys to Cloudflare Pages unchanged.

## Done (this branch — locally verified)

Code-side, production-safe steps that keep the web app at its current root and
building unchanged. Verified with `npm run test:run` (157/157 pass) and
`vite build` (emits `dist/` with `index.html` + `_headers`).

- **npm workspaces** — root `package.json` has `"workspaces": ["packages/*"]`.
- **`packages/core`** (`@gracechords/core`) — pure, DOM-free modules extracted
  from `src/`: ChordPro parser/serialize/lint/convert/lexer/solfege/types +
  transposition (`chordpro/`), chord placement / instrumental / verseRef /
  songMetadata / sort (`songs/`), setlist codec (`setlists/setcode`), role
  hierarchy (`rbac/roles`), and the Supabase factory
  (`supabase/client.js` → `createGcSupabase({ url, anonKey, storage })`).
  Consumed as **source, no build step** via a `@gracechords/core` alias in
  `vite.config.js` plus the workspace symlink.
- **Compatibility shims** — every moved module left a thin re-export at its old
  `src/...` path, so no web import changed. Edit the real code under
  `packages/core/src/`, not the shim.
- **`packages/tokens`** (`@gracechords/tokens`) — `tokens.css` moved here;
  `src/styles/index.css` imports it. JS token map for RN is future work.
- **Injected-factory refactor** — `src/lib/supabase.js` is now a thin wrapper
  passing Vite env + `cookieStorage` to the core factory; `src/utils/setlists/sets.js`
  delegates set shaping to pure helpers in `@gracechords/core/setlists/setStore`
  while keeping its `localStorage` binding web-side.

### Deviation from plan
- **`publicUrl` left web-side, not moved.** The current
  `src/utils/network/publicUrl.js` does not reference `import.meta.env.BASE_URL`
  (only an `import.meta.env.DEV` dev-warning guard) and no core module imports
  it, so moving it now would add risk for no benefit. Move it later if/when a
  core module needs it.

### Note on the test baseline
The suite is **fully green (157/157)** and stays green after the injected-factory
refactor. An older "2 setcode + 11 supabase-load failures" baseline no longer
applies (the vitest config injects `VITE_SUPABASE_URL` and the client is behind
`createGcSupabase`). The `AGENTS.md` "Known baselines" section has been corrected
to reflect this — treat any test failure as a real regression.

## Remaining — requires your Cloudflare dashboard (could not run from here)

These need Cloudflare account access and CF preview observation; they were not
executed. Order matches the approved plan.

1. **Build System V2 gate (Step 0).** Confirm the Pages project is on Build
   System V2 (Settings → Build → Build system version); upgrade if on V1.
   Monorepo support — root directory + build watch paths — requires V2. (Limit:
   max 5 Pages projects per repository.)
2. **Install/Functions spike (Step 0.5).** On a throwaway branch or scratch
   Pages project with root directory = `apps/web`, prove (a) `npm ci` resolves
   the `@gracechords/core` workspace dep for the web build (verify whether CF
   runs install in the repo root or the project root dir, per current CF docs),
   and (b) `functions/` at `apps/web/functions/` is auto-detected. Record the
   working build command before any real move.
3. **Move web app under `apps/web/` (Step 4).** `git mv` `index.html`,
   `vite.config.js`, `src/`, `public/`, `scripts/`, `functions/`, and the web
   `package.json` into `apps/web/`; add `"apps/*"` to root workspaces. Keep
   `functions/` and `public/_headers` at `apps/web/`'s root. `workers/` stays at
   repo root.
4. **CF Pages config cutover (Step 5).** Root directory → `apps/web`; build
   command → the Step 0.5-proven command; output directory → `dist`. Validate on
   a per-branch preview (SPA routes, `/bible/*`, `/pptx/*`, `/api/*`) before
   merging to the production branch.
5. **Mobile placeholder + watch paths (Step 6).** Add empty `apps/mobile/`.
   Set CF build watch paths (relative to repo root): **Exclude `apps/mobile/*`**,
   Include default. Mobile-only commits then skip the web build; `packages/**`
   and `apps/web/**` still rebuild it.
