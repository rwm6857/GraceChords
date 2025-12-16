Build, save, and share worship sets with mobile-friendly controls.

Route snippets
- Main entry: `/#/setlist`
- Shareable link pattern: `/#/setlist/{songIds}?toKeys={keys}` (also accepts `/#/set/{code}`)

## Getting Started
- Browse or search **Add songs**, then tap/click to add titles into the current set.
- Set per-song target keys directly from the list; drag rows or use the built-in move buttons to reorder (optimized for tablet and mobile layouts).
- Toggle **ICP only** to limit suggestions for Instruments of Christ and Peace contexts; `?icp=1` in the URL opens with the filter already on.

## Saving & Loading
- Save sets by name; the title line updates to the last saved name and the Load modal lists every saved set.
- Legacy single-set storage (`localStorage.setlist`) auto-migrates into named saves the first time you open the builder on a new device.
- Sharing supports both parameterized URLs (`/#/setlist/{ids}?toKeys={keys}`) and compact codes (`/#/set/{code}`), and the builder normalizes code links back to the param style.

## Exports
- **Export PDF** merges every selection into one multi-song PDF with transposition applied.
- **Export PPT** checks slide availability per song before combining them; unavailable songs are noted while the rest continue.
- **PPT ZIP** and combined PPT exports display in-progress status strings so you can see bundling/combining progress for large sets.

## Quick Actions
- Launch from Home quick actions or pass a quick-action state to auto-build random sets (celebration set, 3-song flow, or random theme set).
- Use the ICP toggle or `?icp=1` helper when you need instant ICP-focused recommendations.
