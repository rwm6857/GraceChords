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
