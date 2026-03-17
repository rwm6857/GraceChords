Guidelines for contributing code or docs to GraceChords.

## At a glance
- Run tests with `npm test` (or `npm run test:mvp` for PDF export guards).
- Code style: 2-space indent, single quotes, prefer no semicolons; components `PascalCase.jsx`; utils `camelCase.(js|ts)`.
- Keep pull requests small and focused; include screenshots for UI changes.
- Docs live under `public/wiki/`. Repository guidelines live in AGENTS.md at the repo root.
- UI: use token-driven styles from `src/styles/tokens.css` and layout kit components in `src/components/ui/layout-kit/` (see [[UI-Design-System]]).

### Tests
```bash
# full suite
npm test

# PDF export non‑regression tests (formatting, spacing, columns)
npm run test:mvp
```
Changes to PDF formatting should keep `npm run test:mvp` passing to preserve the approved layout.

### Commits & PRs
- Use conventional commits when possible: `type(scope): summary` (e.g., `fix(pdf): prevent orphan lines`).
- Before opening a PR: `npm test`, `npm run build`, and run `npm run build-index` if songs changed.
- For song/slide additions, run `npm run normalize` first to align filenames.

[[Getting-Started]] [[Project-Structure]] [[UI-Design-System]] [[File-Naming-and-Normalization]]
