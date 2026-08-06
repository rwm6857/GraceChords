# Mobile app assets

## `icon.png` — the GraceChords brand app icon

`icon.png` is the real GraceChords app icon: the interlocking "GC" brand mark
(Signal-blue "G" over a light "C") on the dark brand background. It satisfies the
App Store icon requirements (App Store Connect rejects builds with no icon, and
rejects any icon with an alpha channel).

- **Requirements:** 1024×1024, **no alpha channel** (flat RGB PNG), no rounded
  corners (iOS masks them).
- **To swap:** drop the final 1024×1024 no-alpha PNG in as `icon.png`. It is wired
  via `expo.icon` in `apps/mobile/app.json`; no config change needed.
- If a replacement PNG carries an alpha channel, flatten it against the brand
  background before committing:

  ```sh
  npx --yes sharp-cli@^5 -i assets/icon.png -o assets/icon.png flatten --background "#1E2227"
  ```

## `splash-icon*.png` — the launch-screen mark (**keeps its alpha**)

Note the opposite requirement to `icon.png` above: the splash images **must be
transparent**. Reusing `icon.png` as the splash image is exactly what made the
launch screen show a hard-edged dark square floating on the splash background —
the icon's opaque `#1E2227` tile does not match `#14171A`/`#F5F7F9`.

- `splash-icon.png` — mark for the **light** splash background (`#F5F7F9`).
- `splash-icon-dark.png` — mark for the **dark** splash background (`#14171A`).
- **Requirements:** 1024×1024, alpha channel intact, no background fill. Wired via
  the `expo-splash-screen` plugin in `apps/mobile/app.json`.
- `imageWidth` in that plugin config (200) and `SPLASH_IMAGE_WIDTH` in
  `src/components/SplashOverlay.tsx` describe the same mark and **must stay in
  sync** — the overlay is drawn to be pixel-identical to the native splash so the
  handoff between them is invisible.

### `brand/` — the vector source of truth

`brand/gc-mark.svg` (for light backgrounds) and `brand/gc-mark-dark.svg` (for dark
backgrounds) are the traced GC mark on a **square, centred, transparent** canvas:
`viewBox="-51 -68 1620 1620"`, chosen so the mark's real bounding box (1368×1370,
centred at 759,742 in the original trace) sits centred *and* inside the canvas's
inscribed circle — which is what Android 12+ clips a splash icon to. Colors are the
`@gracechords/tokens` values (`#1E2227` ink, `#1F84C9` / `#4EA6E6` accents).

Regenerate the PNGs after editing either SVG (reproduces the committed files
byte-for-byte):

```sh
npx --yes sharp-cli@^5 -i assets/brand/gc-mark.svg      -o assets/splash-icon.png      resize 1024 1024
npx --yes sharp-cli@^5 -i assets/brand/gc-mark-dark.svg -o assets/splash-icon-dark.png resize 1024 1024
```
