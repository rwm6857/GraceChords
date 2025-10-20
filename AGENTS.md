# Repository Guidelines

## Project Structure & Module Organization
- `src/`: React app (components, pages, utils, styles, tests). Key areas: `src/utils/pdf_mvp`, `src/utils/pdf`, `src/utils/chordpro`, `src/data/index.json`.
- `public/`: user content and static assets — songs in `public/songs/`, UI fonts in `public/fonts/`, optional slides in `public/pptx/`.
- `scripts/`: maintenance tasks (index build, filename normalization, wiki sync).
- `docs/`: Vite build output for GitHub Pages. Do not edit by hand.

## Build, Test, and Development Commands
- `npm ci`: install exact dependencies.
- `npm run dev`: start Vite dev server (http://localhost:5173).
- `npm run build`: produce static site into `docs/`.
- `npm run preview`: preview the production build locally.
- `npm run build-index`: generate `src/data/index.json` from `public/songs/`.
- `npm run normalize`: normalize song/PPTX filenames into canonical forms.
- `npm test` / `npm run test:watch`: run Vitest (happy-dom + Testing Library).
- `npm run test:mvp`: run PDF MVP engine safeguards.

## Coding Style & Naming Conventions
- Indentation: 2 spaces; single quotes; prefer no semicolons (match existing files).
- React components: `PascalCase.jsx` (e.g., `SongView.jsx`). Utilities: `camelCase.js/ts`.
- Tests: place under `__tests__/` next to code; name `*.test.(js|jsx|ts)` or `*.spec.*`.
- Paths and assets: keep song files lowercase with underscores (see `normalize` script).

## Testing Guidelines
- Frameworks: Vitest + @testing-library/react, environment `happy-dom` (`src/setupTests.js`).
- Write unit tests for utilities and component behavior; prefer accessible queries over `data-testid`.
- Run full suite with `npm test`; target PDF layout with `npm run test:mvp`.
- Keep tests deterministic; avoid timers and real network.

## Commit & Pull Request Guidelines
- Commit style: conventional preferred — `type(scope): summary`.
  - Examples: `feat(songbook): two‑column reading view`, `fix(pdf): prevent orphan lines`, `chore(index): rebuild`.
- PRs: include a clear description, linked issues, and screenshots/GIFs for UI changes. Note any data/index impacts.
- Before opening: run `npm test`, `npm run build`, and (if you added songs) `npm run build-index`.
- Do not commit secrets or `.env`; do not hand‑edit `docs/`.

## Security & Configuration Tips
- Local `.env`: set `VITE_ADMIN_PW=your-password`. For deploys, set the same repo secret; optional `VITE_COMMIT_SHA=$(git rev-parse HEAD)` during builds to bust caches.
- Fonts for PDF export must exist in `src/assets/fonts/` (see README for list).
