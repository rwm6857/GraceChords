# @gracechords/mobile (placeholder)

Reserved placeholder for the future GraceChords Expo (React Native) iOS app.

**No Expo work has begun.** There is no React Native, no Expo, and no
dependencies here yet — only a minimal workspace `package.json` so the
`apps/mobile/*` path is reserved and recognized by the npm workspaces config.

It is intentionally excluded from every build, test, and lint task. The future
app will consume shared logic from `@gracechords/core` (the ChordPro parser,
transposition, setlist codec, Supabase factory, etc.); the ChordPro renderer is
web-specific and will be rebuilt natively here.

CF Pages build watch paths are configured to **exclude `apps/mobile/*`**, so
commits touching only this directory do not trigger a web build. See
`MONOREPO_MIGRATION.md`.
