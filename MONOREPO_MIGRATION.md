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

## Done — Step 4: web app moved under `apps/web/` (locally verified)

The web app now lives in `apps/web/`. Verified after the move: `npm run test:run`
**157/157 pass**, `vite build` emits **`apps/web/dist/`** (with `index.html`,
`_headers`, `sw.js`, `404.html`), `npm run lint` clean, and `vite preview` serves
the SPA (HTTP 200, deep-link `/songs/` falls back to index). CF Functions
runtime was not exercised (wrangler not installable in the sandbox); all 8
Functions pass `node --check` and sit at `apps/web/functions/`.

- **Moved into `apps/web/`** via `git mv`: `index.html`, `404.html`,
  `vite.config.js`, `eslint.config.js`, `src/`, `public/` (with `_headers`),
  `scripts/`, `functions/`, and the web `package.json`. `404.html` and
  `eslint.config.js` were not in the original list but had to move (the former is
  copied by `viteStaticCopy`; the latter keeps flat-config base-path aligned with
  the web lint cwd).
- **Stayed at repo root:** `packages/`, `workers/`, `supabase/`, the workspace
  `package.json`, and `package-lock.json`.
- **package.json split:** the old root manifest became `apps/web/package.json`
  (`@gracechords/web`, with `@gracechords/core` + `@gracechords/tokens` as
  workspace deps); a new root `package.json` (`gracechords-monorepo`) holds
  `"workspaces": ["apps/*","packages/*"]` and delegating scripts
  (`npm run build` → `-w @gracechords/web`, etc.).
- **Paths fixed for the new depth:**
  - `apps/web/vite.config.js`: `@gracechords/core` alias → `../../packages/core/src`;
    added `envDir` → repo root so the root `.env` (next to `.env.example`) still loads.
  - `apps/web/src/styles/index.css`: token import switched to the package
    specifier `@gracechords/tokens/tokens.css` (move-stable, no relative depth).
  - `apps/web/scripts/generate-seo-pages.mjs` and `generate-sitemap.mjs`: now
    resolve paths from `import.meta.url` (not `process.cwd()`) — `dist`/`src`/
    `public` from `apps/web/`, `.env` from the repo root — so they are
    cwd-independent (same pattern `i18n-check.mjs` already used).
  - `functions/` import only each other (`../_shared.js`) and no `src`/`packages`
    paths, so they needed no edits.

## Cloudflare Pages settings to apply (dashboard) — Step 5 cutover

Build System is **V3** (confirmed), so monorepo root-directory + build watch
paths are available. Apply these in **Pages → Settings → Builds & deployments**.

| Setting | Value |
|---|---|
| **Root directory** | `apps/web` |
| **Build command** | `cd ../.. && npm ci && npm run build -w @gracechords/web` |
| **Build output directory** | `dist`  *(relative to root directory → `apps/web/dist`)* |
| **Functions** | auto-detected at `apps/web/functions/` (it sits at the root directory) |
| **Env vars** | unchanged — already set in Pages → Variables (`VITE_*`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_R2_PUBLIC_URL`/`BIBLE_CDN_URL`, bot tokens) |
| **Node version** | ensure 18+ (Vite 7). CF V3 default is fine; pin via `NODE_VERSION` env or a `.node-version` file if a build picks an older Node. |

**Why this build command.** Root directory must be `apps/web` so CF finds
`functions/` and the `dist/` output there. But the npm **lockfile and the
`@gracechords/*` workspace links live at the repo root**, and the web's
`"@gracechords/core": "*"` / `"@gracechords/tokens": "*"` deps only resolve when
npm runs at the workspace root. So the build command `cd ../..` to the repo root,
runs `npm ci` (installs all workspaces from the root lockfile, hoisting
`node_modules` to the root and creating the `@gracechords/*` symlinks), then
`npm run build -w @gracechords/web` (npm runs the web build with cwd =
`apps/web`, so `vite build` → `apps/web/dist` and the SEO scripts resolve via
`import.meta.url`). Node's module resolution walks up to the root `node_modules`,
so building from `apps/web` finds the hoisted deps.

> **First-deploy check (the one thing the skipped spike would have confirmed):**
> watch the build log to confirm the install step resolves `@gracechords/core`
> (no "404 Not Found" for `@gracechords/*`). If CF's *automatic* pre-build
> install runs inside `apps/web` and fails on the `*` workspace specifiers before
> the build command runs, the workspace deps aren't resolving at the root — in
> that case rely solely on the `cd ../.. && npm ci` in the build command (it
> installs correctly at the root). The `cd ../..` form above is written to be
> self-sufficient regardless of CF's auto-install behavior.

**Validate on a per-branch preview before merging to the production branch:**
push this branch, open the CF `*.pages.dev` preview, and check SPA routes load,
deep links resolve (`/songs/...`), and Functions respond: `/bible/<lang>/<id>`,
`/pptx/<slug>.pptx`, and an `/api/*` endpoint. Only then point the production
branch at the new settings.

## Done — Step 6 (repo work): `apps/mobile/` placeholder (locally verified)

Added an empty `apps/mobile/` workspace placeholder — **no Expo/React Native, no
dependencies, in no build**:
- `apps/mobile/package.json` — `@gracechords/mobile`, `private`, version `1.0.0`,
  no dependencies, no scripts.
- `apps/mobile/README.md` — states it is a reserved placeholder and that no Expo
  work has begun.

It is already covered by the root `"workspaces": ["apps/*","packages/*"]` glob
(`npm query .workspace` lists `@gracechords/mobile`; it linked at
`node_modules/@gracechords/mobile`). Adding it did not change the web app: after
`npm install`, `npm run test:run` = **157/157**, `npm run lint` clean, and
`vite build` still emits **`apps/web/dist/`** (`index.html` + `_headers`).

### Cloudflare Pages — Build watch paths to apply (dashboard)

In **Pages → Settings → Builds & deployments → Build watch paths**:

| Field | Value |
|---|---|
| **Exclude paths** | `apps/mobile/*` |
| **Include paths** | default (`*`) |

A commit touching only `apps/mobile/**` then **skips** the web build, while
changes under `packages/**` and `apps/web/**` still **trigger** it. (Watch paths
are evaluated relative to the repo root; excludes cover nested paths and `*`
spans `/`, so the single `apps/mobile/*` entry fully scopes out the mobile app.)

> Out of scope here: any Expo/React Native setup and applying the watch-paths
> setting in the dashboard (that one's yours).
