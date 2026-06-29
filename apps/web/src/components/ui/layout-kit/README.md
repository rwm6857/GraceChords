# Layout Kit

UIKit-inspired layout primitives for GraceChords. Import from `src/components/ui/layout-kit` and compose with existing pages.

Usage highlights
- `PageHeader` for page titles + optional subtitle/actions.
- `Card` and `InsetCard` for surface blocks.
- `Toolbar` with `sticky` prop for anchored controls.
- `SegmentedControl` for compact filters (keyboard accessible).
- `Chip` for tags/filters (`variant="tag" | "filter"`).
- `Field` for label + input + help/error text.
- `IconButton` for 44px hit targets.

All classes are `gc-*` and token-driven via `src/styles/tokens.css`.
Styles are loaded globally in `src/main.jsx`.
