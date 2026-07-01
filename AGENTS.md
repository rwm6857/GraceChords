# Repository Guidelines

This is the **root** agent guide for the GraceChords monorepo. It covers
conventions that span the whole repo. Platform-specific rules live in per-app
sub-docs — **read the matching one before touching that app.**

## Which doc applies to your change

| You're working on… | Read |
|--------------------|------|
| The web app (`apps/web/**`) | [`apps/web/AGENTS.md`](apps/web/AGENTS.md) — structure, design tokens, PDF engine, service worker, i18n, Cloudflare wiring, env vars, testing baselines |
| The iOS app (`apps/mobile/**`) | [`apps/mobile/AGENTS.md`](apps/mobile/AGENTS.md) — theme/primitives, SF Symbols, auth gating, Metro resolution, CNG, Supabase |
| Shared logic (`packages/**`) | this file (below) |
| Workers (`workers/**`) | the `README.md` / `ARCHITECTURE.md` in that worker's directory |

`CLAUDE.md` and `CODEX.md` are thin pointers to this file — keep all agent rules
here (or in a sub-doc) so nothing drifts across duplicated instruction files. Do
not add competing instruction files inside `apps/*/` beyond the single `AGENTS.md`
each already has.

## Monorepo & shared core

This repo is an npm-workspaces monorepo. Platform-agnostic logic lives in
`packages/`; the two apps consume it.

```
apps/web/       @gracechords/web     — React + Vite SPA (production site)
apps/mobile/    @gracechords/mobile  — Expo / React Native iOS app
packages/core/  @gracechords/core    — shared, DOM-free TS/JS
packages/tokens/@gracechords/tokens  — design tokens (web CSS + native TS map)
workers/        Cloudflare Workers (deployed independently)
supabase/       SQL migrations
```

- The web app lives in `apps/web/` (its `src/`, `public/`, `functions/`, `scripts/`, `index.html`, `vite.config.js`, `eslint.config.js`). Cloudflare Pages' root directory is `apps/web`. See [`MONOREPO_MIGRATION.md`](MONOREPO_MIGRATION.md) for the exact CF settings.
- The Expo iOS app lives in `apps/mobile/` (`@gracechords/mobile`). It's a real native client (themed four-tab shell, Song Library + Home screens, an authenticated-only route gate), not just a scaffold.
- Run web tasks from the repo root via the delegating scripts (`npm run dev`, `npm run build`, `npm run test`, `npm run lint` → `-w @gracechords/web`), or from inside `apps/web/`.
- The repo root holds only the workspace `package.json` + lockfile, `packages/`, `apps/`, `workers/`, `supabase/`, and docs.

### `packages/core` (`@gracechords/core`)
Pure, DOM-free, bundler-free TypeScript/JS shared across web and mobile — the
ChordPro **parser** (not the renderer), transposition, chord placement, verse
refs, song metadata/sort, the setlist codec, the role hierarchy, and the Supabase
**factory** (`supabase/client.js`, `createGcSupabase({ url, anonKey, storage })`).
Consumed as **source, no build step** via the `@gracechords/core` alias
(`apps/web/vite.config.js`) plus the workspace symlink; Metro transpiles it for
mobile.

- **Compatibility shims:** every module moved into `packages/core` left a thin re-export shim at its original `apps/web/src/...` path (e.g. `src/utils/chordpro/parser.ts`, `src/lib/roles.js`), so existing web imports are unchanged. **Edit the real implementation under `packages/core/src/`, not the shim.**
- The ChordPro **renderer** (PDF/JPG/Canvas) stays web-side and is not shared.
- Mobile consumes core's exports only. If a query/util is missing, add an **additive** export to core — never duplicate logic in an app, and never edit core internals to suit one platform.

### `packages/tokens` (`@gracechords/tokens`)
The single home for both platforms' design tokens. Web imports `tokens.css`
(the warm-brown `--gc-*` palette, via `apps/web/src/styles/index.css`); React
Native imports the typed map from `@gracechords/tokens/native` (`native.ts`, the
iOS Signal-blue palette). The two palettes are **deliberately different** — don't
hardcode token values in either app.

## Roles & auth (shared model)
- Supabase provides auth and data for both apps. The role system is `user → collaborator → editor → admin → owner`, stored in `public.users.role`.
- **Single source of truth:** `packages/core/src/rbac/roles.js` exports `ROLE_ORDER`, `ROLES_BY_RANK_DESC`, and `hasMinRole()`. Always use `hasMinRole()` for gate checks; never hardcode role strings in conditionals unless adding a new role. The `workers/pptx-upload/` worker keeps its own copy because it's bundled separately — keep the two in sync if the hierarchy changes.
- All Supabase tables have row-level security. Test query changes with a non-owner account before shipping.
- The **anon** key is safe in both clients; the **service-role** key is server-side only (Node build scripts, Workers, Pages Functions) and must never reach bundled app code.

## General AI principles
- **Minimal diffs.** Fix what was asked; don't refactor surrounding code, add unrelated features, or introduce abstractions beyond what the task requires. Three similar lines beat a premature abstraction.
- **No speculative features.** Don't design for hypothetical future requirements.
- **No unnecessary comments.** Only comment when the *why* is non-obvious (a hidden constraint, subtle invariant, or framework workaround). Never restate the code.
- **Security first.** Never introduce command injection, XSS, SQL injection, or other OWASP Top 10 issues. Fix insecure code when you spot it.
- **No half-finished implementations.** If a feature can't be completed safely in the current change, leave existing code intact and raise the gap explicitly.
- **Prefer editing existing files over creating new ones.** Never commit `.env` or secrets.

## Branching, commits & PRs
- Development branches follow `claude/<short-description>-<id>`.
- Commit style: Conventional Commits — `type(scope): summary`. Examples: `feat(setlist): team sharing`, `fix(pdf): orphan lines`, `chore: rebuild index`.
- Push to the feature branch; **do not open the PR** unless asked — the user creates it. Never push directly to `main`.
- PRs: clear description, linked issues, and screenshots/GIFs for UI changes. Note any Supabase migration impact and which migrations to apply.
- Before pushing web changes: run `npm test` and `npm run build`; both must pass at the baselines in [`apps/web/AGENTS.md`](apps/web/AGENTS.md).

## Environment variables
- New env vars must be documented in [`.env.example`](.env.example) (web) or `apps/mobile/.env.example` (mobile) in the **same commit** they're introduced, with a placeholder and one-line description.
- Production web values are configured in Cloudflare Pages → Settings → Variables. Don't add, change, or remove production secrets from code.

## Docs & wiki
- User-facing and infrastructure documentation lives in the GitHub Wiki. Its source is `apps/web/public/wiki/**`; pushing changes there triggers the wiki sync workflow (`.github/workflows/wiki-sync.yml`). Keep wiki edits in the source files, not the live wiki, so they survive.
