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

## `sprites/` — the profile avatars (**WebP, via `expo-image` only**)

The 15 avatars a user picks from in "Choose your icon" / Settings → Account →
Your icon. They are the *profile* avatar, not the app icon: the persisted value
lives in `users.preferences.sprite` and is **shared with the web app**, so the
ids here and in `apps/web/src/components/ui/SpritePicker.jsx` must match
exactly, and both apps must show the same artwork for a given id.

**The source of truth is the web copy, `apps/web/public/sprites/<id>.webp`.**
Mobile now ships the same format, at 344KB instead of the 1.1MB the PNG set
cost.

**They must only ever be rendered through `expo-image`.** React Native's own
`Image` supports WebP on Android only (see the format list in
`react-native/Libraries/Image/ImageProps.js`), and on iOS a `.webp` source
decodes to nothing — which is exactly what shipped once, as blank circles in
the Settings profile card, the Home and Daily Word headers, and an avatar
picker whose unselected tiles were invisible. `expo-image` decodes WebP on both
platforms, which is what makes shipping WebP possible at all; swapping any of
these call sites back to RN's `Image` reintroduces that bug on iOS.

- **Requirements:** `<id>.webp`, 384×384, alpha intact. 384 is 3× the largest
  size any screen draws them at (the picker's tiles on the widest phone);
  everything else — the 52pt profile card, the 30pt headers, the 29pt row —
  scales down from the same file.
- Regenerate all 15 from the web originals:

  ```sh
  npx --yes sharp-cli@^5 -i "../web/public/sprites/*.webp" -o assets/sprites/ \
    --format webp --quality 88 resize 384 384
  ```

- Adding an avatar means adding the `.webp` to `apps/web/public/sprites/`, the
  id to **both** `SPRITE_IDS` lists, a `require` line in
  `src/lib/sprites.ts` (Metro needs static literals), and re-running the
  command above.

## In-app marks — `mark.webp`, `google-g.webp`, `splash-mark*.png`

Distinct from the store/launcher assets above, and sized for what actually draws
them rather than for the store. `icon.png` and `splash-icon*.png` stay 1024×1024
because `app.json` hands them to the native icon and splash pipelines; rendering
those same files in JS meant decoding a 1024² bitmap (~4MB) for a 28pt logo.

- `mark.webp` — 192×192, the app mark for the Home header (28pt) and the Auth
  screen (64pt). Rendered with `expo-image`.
- `google-g.webp` — 64×64, the Google "G" on the sign-in button (20pt).
  Rendered with `expo-image`.
- `splash-mark.png` / `splash-mark-dark.png` — 600×600, for
  `SplashOverlay`'s 200pt mark. **PNG, not WebP**, because the overlay stays on
  RN's `Animated.Image`: the splash handoff keys off `onLoadEnd` and is timing
  sensitive, so it is deliberately not converted.

```sh
npx --yes sharp-cli@^5 -i assets/icon.png             -o assets/mark.webp             --format webp resize 192 192
npx --yes sharp-cli@^5 -i assets/splash-icon.png      -o assets/splash-mark.png       resize 600 600
npx --yes sharp-cli@^5 -i assets/splash-icon-dark.png -o assets/splash-mark-dark.png  resize 600 600
```
