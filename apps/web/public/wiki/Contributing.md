Guidelines for contributing code or docs to GraceChords.

## At a glance
- Run tests with `npm test` (or `npm run test:mvp` for PDF export guards).
- Code style: 2-space indent, single quotes, prefer no semicolons; components `PascalCase.jsx`; utils `camelCase.(js|ts)`.
- Keep pull requests small and focused; include screenshots for UI changes.
- Wiki docs live under `apps/web/public/wiki/`. Agent/contributor guidelines live in `AGENTS.md` at the repo root (which routes to `apps/web/AGENTS.md` and `apps/mobile/AGENTS.md`).
- UI: use token-driven styles from `packages/tokens/tokens.css` and layout kit components in `apps/web/src/components/ui/layout-kit/` (see [[UI-Design-System]]).

### Tests
```bash
# full suite
npm test

# PDF export non-regression tests (formatting, spacing, columns)
npm run test:mvp
```
Changes to PDF formatting should keep `npm run test:mvp` passing to preserve the approved layout.

### Commits & PRs
- Use conventional commits when possible: `type(scope): summary` (e.g., `fix(pdf): prevent orphan lines`).
- Before opening a PR: run `npm test` and `npm run build`.
- Song or post changes are made directly in Supabase (no file-based index to rebuild).

[[Getting-Started]] [[Project-Structure]] [[UI-Design-System]]
