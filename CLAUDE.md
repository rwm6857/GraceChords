# Claude Code Guidance

This repository's agent guidance is consolidated in [AGENTS.md](./AGENTS.md).
Read it in full before making changes — it is the single source of truth for
monorepo-wide conventions, and it routes to per-app sub-docs
([`apps/web/AGENTS.md`](./apps/web/AGENTS.md),
[`apps/mobile/AGENTS.md`](./apps/mobile/AGENTS.md)) for platform-specific rules
(build/test commands, design tokens, file-scope rules, the i18n workflow, etc.).

Maintainer note: keep this file as a pointer only. Add new agent rules to
`AGENTS.md` (or the relevant sub-doc) so the instruction files cannot drift.
