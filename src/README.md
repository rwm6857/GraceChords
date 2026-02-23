# `src/` Organization

This repository uses a route-first layout with shared UI and feature modules separated clearly.

## Directories

- `app entry`: `main.jsx`, `App.jsx`
  - App bootstrap and route registration only.
- `pages/`
  - Route-level screens only.
  - Naming convention: `*Page.jsx` / `*Page.tsx`.
- `features/`
  - Feature-internal modules that support pages (for example `features/readings/*`).
- `components/`
  - Reusable, cross-route UI building blocks.
  - Keep route-specific screens out of this directory.
- `utils/`
  - Pure utilities, formatting, parsing, PDF/chord tooling, and data helpers.
  - Grouped by domain:
    - `utils/app`: app-level state/helpers (`theme`, `toast`)
    - `utils/network`: fetch/cache/public URL/GitHub API helpers
    - `utils/songs`: song/domain logic (`catalog`, tags, sorting, verse refs, transposition helpers)
    - `utils/setlists`: set persistence and compact set-code encoding
    - `utils/media`: image/JPG rendering and sharing helpers
    - `utils/content`: markdown/frontmatter helpers
    - `utils/archive`: zip creation helpers
    - `utils/chordpro`, `utils/pdf`, `utils/pdf_mvp`, `utils/export`: existing specialized engines/tooling
- `styles/`
  - Global style entry and token/theme layers.
  - Use `styles/index.css` as the global import surface.

## Conventions

- New route screen: place in `pages/` as `FeatureNamePage`.
- New reusable UI piece: place in `components/`.
- New feature-only helper(s): place in `features/<feature>/`.
- New utility: place under the closest `utils/<domain>/` folder instead of `utils/` root.
- Prefer updating imports to canonical locations; avoid re-export shims unless needed for migration.
