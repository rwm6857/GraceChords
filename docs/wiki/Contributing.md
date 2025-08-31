Guidelines for contributing code or docs to GraceChords.

## At a glance
- Run tests with `npm test` (or `npm run test:mvp` for PDF export guards)
- Follow project coding style (Prettier/ESLint defaults)
- Keep pull requests small and focused
- Docs live under `public/wiki/`

### Tests
```bash
# full suite
npm test

# PDF export non‑regression tests (formatting, spacing, columns)
npm run test:mvp
```

Changes to PDF formatting should keep `npm run test:mvp` passing to preserve the approved layout (title 26pt, key 16pt gray, lyric/chord ≥12pt, column/page rules).

### Pull requests
Open a PR for any change. Documentation updates should modify files under `public/wiki/**`.

[[Getting-Started]] [[Project-Structure]]
