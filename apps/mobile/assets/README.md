# Mobile app assets

## `icon.png` — PLACEHOLDER (swap before public release)

`icon.png` is a **temporary** app icon so EAS / TestFlight builds pass their icon
check (App Store Connect rejects builds with no icon, and rejects any icon with an
alpha channel). It is intentionally a flat brand-color square with a white "GC"
monogram — **not** the real brand icon.

- **Requirements:** 1024×1024, **no alpha channel** (flat RGB PNG), no rounded
  corners (iOS masks them).
- **Colors used:** background `#1F84C9` (Signal blue — `light.accent` in
  `packages/tokens/native.ts`), monogram `#FFFFFF` (`light.onAccent`).
- **To swap:** drop the final 1024×1024 no-alpha PNG in as `icon.png`. It is wired
  via `expo.icon` in `apps/mobile/app.json`; no config change needed.

To regenerate an identical placeholder without adding an image dependency to the
repo, run this one-off from `apps/mobile/` (uses a throwaway `sharp` via `npx`):

```sh
npx --yes sharp-cli@^5 -i /dev/stdin -o assets/icon.png <<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
  <rect width="1024" height="1024" fill="#1F84C9"/>
  <text x="50%" y="50%" fill="#FFFFFF" font-family="Arial, sans-serif"
        font-size="520" font-weight="bold" text-anchor="middle"
        dominant-baseline="central" letter-spacing="-8">GC</text>
</svg>
SVG
# then flatten to strip any alpha:
npx --yes sharp-cli@^5 -i assets/icon.png -o assets/icon.png flatten --background "#1F84C9"
```
