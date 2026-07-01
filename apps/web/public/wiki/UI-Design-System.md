UIKit-inspired design system for GraceChords.

## Tokens
- Source of truth: `packages/tokens/tokens.css` (the `@gracechords/tokens` package), imported into the web app via `apps/web/src/styles/index.css`.
- Light and dark palettes use Apple system colors.
- Spacing, radii, typography, and motion are tokenized.
- Use `--gc-*` tokens in CSS instead of hardcoded hex values.

## Layout kit
Reusable primitives live in `apps/web/src/components/ui/layout-kit/` and are styled by `layout-kit.css`.
- PageHeader: title, optional subtitle, optional actions.
- Card / InsetCard: surface blocks with consistent padding and separators.
- Toolbar: consistent padding; optional sticky behavior.
- SegmentedControl: accessible segmented buttons.
- Chip: filter and tag variants.
- Field: label, control, help, and error text.
- IconButton: 44px minimum hit targets.

## Back-compat bridge
Legacy classes are kept stable and mapped to tokens in `apps/web/src/styles.css`.
- `.btn` and `.btn.primary` follow the kit styling.
- `.card` matches the Card surface.
- `.iconbtn` matches IconButton.
- `.container` preserves existing layout spacing.

## Guidelines
- Prefer layout kit components for new UI and high-visibility changes.
- Keep styling token-driven and consistent across pages.
- Respect `data-theme="dark"` and the shared focus ring styles.

Related pages: [[Contributing]] [[Project-Structure]]
