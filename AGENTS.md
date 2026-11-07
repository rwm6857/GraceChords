# Repository Guidelines

Root agent guide for the GraceChords monorepo: conventions that span the whole
repo. Each app has its own `AGENTS.md` with platform rules — read it before
touching that app. (Claude Code loads it automatically via the app's pointer
`CLAUDE.md`; Codex reads nested `AGENTS.md` natively.)

| Working on… | Rules |
|---|---|
| `apps/web/**` | [`apps/web/AGENTS.md`](apps/web/AGENTS.md) |
| `apps/mobile/**` (iOS + Android) | [`apps/mobile/AGENTS.md`](apps/mobile/AGENTS.md) |
| `apps/studio/**` (macOS SwiftUI) | [`apps/studio/README.md`](apps/studio/README.md) |
| `packages/**` | this file |
| `workers/**` | that worker's `README.md` / `ARCHITECTURE.md` |

## Monorepo layout

npm-workspaces monorepo; platform-agnostic logic lives in `packages/`.

```
apps/web/        @gracechords/web     — React + Vite SPA (production site, Cloudflare Pages root)
apps/mobile/     @gracechords/mobile  — Expo / React Native app (iOS + Android)
apps/studio/     macOS SwiftUI app (not an npm workspace)
packages/core/   @gracechords/core    — shared, DOM-free TS/JS
packages/tokens/ @gracechords/tokens  — design tokens (web CSS, native TS map, generated Swift)
workers/         Cloudflare Workers (deployed independently)
supabase/        SQL migrations
```

Run web tasks from the repo root (`npm run dev|build|test|lint` delegate to
`-w @gracechords/web`). Cloudflare deploy settings: [`MONOREPO_MIGRATION.md`](MONOREPO_MIGRATION.md).

### `packages/core`
Pure, DOM-free TS/JS shared by web and mobile: the ChordPro **parser** (the
PDF/JPG/Canvas renderer stays web-only), transposition, chord placement, verse
refs, song metadata/sort, the setlist codec, the role hierarchy, repos, and the
Supabase factory `createGcSupabase({ url, anonKey, storage })`. Consumed as
**source with no build step** (Vite alias on web, Metro transpiles on mobile) —
never add a build step.

- Modules moved into core left re-export shims at their old `apps/web/src/...`
  paths. **Edit the real implementation under `packages/core/src/`, not the shim.**
- If an app needs a query/util core lacks, add an **additive** export to core.
  Never duplicate logic in an app; never change core internals to suit one platform.

### `packages/tokens`
Every platform's design tokens. Web imports `tokens.css` (`--gc-*`); React
Native imports `@gracechords/tokens/native` (`native.ts`). Both use the Signal
Blue accent (`#1F84C9` light / `#4EA6E6` dark); neutrals and surfaces differ per
platform. Never hardcode token values in an app.

- `apps/studio` shares the **mobile** palette via committed, generated Swift.
  `native.ts` is the source of truth: change it, run `npm run tokens:swift`, commit
  both. **Never hand-edit the generated Swift.** `npm run tokens:swift:check` is the
  `token-drift` PR check (needs Node ≥ 22.18 — it imports `.ts` directly).
- Platform *translation* of a shared token (e.g. Studio's macOS type scale)
  belongs in the consuming app, not in `native.ts`.

## Roles, auth & database
- Supabase provides auth and data for both apps. Roles: `user → editor → admin → owner`
  in `public.users.role`. (`collaborator` was removed; `hasMinRole()` grants an
  unknown role nothing, and the DB check constraint rejects it.)
- **Single source of truth:** `packages/core/src/rbac/roles.js` (`ROLE_ORDER`,
  `ROLES_BY_RANK_DESC`, `hasMinRole()`). Always gate with `hasMinRole()`; never
  hardcode role strings in conditionals. `workers/pptx-upload/` bundles its own
  copy — keep it in sync if the hierarchy changes.
- `owner` is not assignable through the app: `update_user_role()` accepts only
  `admin`/`editor`/`user` and never the caller's own role; a `guard_users_role_change`
  trigger rejects any other write to `users.role`, and `authenticated` may UPDATE
  only `display_name` and `preferences`.
- **RLS on every table**; new tables ship with RLS policies in the same change.
  Test query changes with a non-owner (`user`) account. Policies are permissive
  and **OR'd**, so tightening one does nothing while a broader one exists —
  list what is live (`select policyname, cmd, qual, with_check from pg_policies
  where tablename = '<table>'`) before editing.
- **Migrations are applied by hand, never `supabase db push`** (the remote history
  is un-recorded, so `db push` would replay destructive migrations). Apply with
  `supabase db query --linked -f <file>` or the dashboard SQL editor. Write them
  idempotently (`IF NOT EXISTS`, `DROP POLICY IF EXISTS` before `CREATE POLICY`).
  Ship a `<timestamp>_<name>.down.sql` beside each, whose header states whether
  the revert is data-lossless or only schema-clean.
- The **anon** key is safe in clients. The **service-role** key and other secrets
  (`RESEND_API_KEY`, Worker secrets) are server-side only (Node build scripts,
  Workers, Pages Functions) and must never reach bundled app code.

## Working rules
- **Minimal diffs.** Do what was asked; no drive-by refactors, speculative
  features, or premature abstractions. If something can't be finished safely,
  leave existing code intact and say so.
- Comment only a non-obvious *why*. Never commit `.env` or secrets.
- **Don't offer to watch, subscribe to, auto-respond to, or autofix PRs.** Pushing
  the branch is the end of the task; the maintainer drives the PR.

## Branches, commits & PRs
- Branches: `claude/<short-description>-<id>`. Never push to `main`.
- Conventional Commits: `type(scope): summary` (e.g. `fix(pdf): orphan lines`).
- **Don't open a PR unless asked.** PR descriptions: link issues, add screenshots
  for UI changes, and list any migrations to apply.
- Before pushing, run the checks in the touched app's `AGENTS.md`.

## Environment variables
- Document every new env var in the same commit: [`.env.example`](.env.example)
  (web, read from the repo root) or `apps/mobile/.env.example`, with a placeholder
  and a one-line description.
- Production web values live in Cloudflare Pages → Settings → Variables. Don't
  add, change, or remove production secrets from code.

## Docs
- User/infra docs are the GitHub Wiki, sourced from `apps/web/public/wiki/**`
  (synced by `.github/workflows/wiki-sync.yml`). Edit the source, not the live wiki.
- **Keeping agent docs lean.** `AGENTS.md` files hold *rules*: commands,
  conventions, and the "don't do X because Y" an agent would otherwise get wrong.
  Feature internals and design rationale go in a `README.md` beside the code,
  with a one-line pointer from `AGENTS.md`. State current facts only — no change
  history, "previously…", or "no longer…". `CLAUDE.md` / `CODEX.md` stay pointers.
