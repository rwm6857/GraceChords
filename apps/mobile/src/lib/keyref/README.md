# Key Reference

`app/key-reference.tsx` → `KeyReferenceScreen`; components in
`src/components/keyref/`, logic here. A cropped circle-of-fifths dial under a
scrolling list of progressions. Standalone: the key is chosen by turning the
dial, never seeded from a song or setlist.

Most numbers and behaviours below are deliberate and locked by tests in
`__tests__/`. Read this before changing them.

## Data
- **Progressions are stored numerically** (`types.ts`, `progressions.ts`): scale
  degree + optional quality override + optional bass degree + optional extension.
  Letters are a view computed per key in `render.ts`, the only module that turns
  a degree into a note.
- Canonical text: `1`, `1/3`, `5/7`, `2maj`, `2m7`. **A bare `7` is the vii° chord,
  never shorthand for `5/7`** (nor `3` for `1/3`); `parseChordToken` throws rather
  than guessing.
- Two sets: 19 diatonic **General** progressions (inversions included — a slash
  chord is still a chord of the key) and the 14-entry **Prayer** set, whose two
  source annotations are `noteKey`s shown in a sheet, not playable data.
- Every id needs a label in `i18n/locales/*/utilities.json`. A missing one renders
  the raw key instead of failing, so a test asserts the two lists match.

## Dial geometry (`arcGeometry.ts`)
- Both rings use **true 30° circle-of-fifths spacing**, concentric. The inner ring
  is rotated **half a step** (`minorAngleOffset`) so its four bubbles sit centred
  under the tonic — each minor sits between two majors (the classic offset ring).
- Outer radius 172, inner 116. At a smaller inner radius the 44pt bubbles nearly
  touch; **don't widen the angle to compensate — grow the radii.** The outer
  radius is capped by width: at 375pt the widest bubbles reach ±175.2 of a 187.5pt
  half-width. Tune numbers here, not in the component. Tests assert the 44pt
  floor, non-overlap, true spacing, and the 375pt fit.
- **Two stroked rings make it read as a wheel.** They are bordered `View`s wider
  than the frame, cropped by `overflow: 'hidden'` (the same technique as
  `PitchPipeScreen`). **`react-native-svg` is not installed and not needed.** A
  circle can't reach the screen edge without flattening the arc, so the crop cuts
  both strokes at the box's bottom edge instead.
- The arc box is **full-bleed and self-measuring** (`onLayout`, not
  `useWindowDimensions`): in landscape the safe-area inset makes the usable width
  narrower than the window.
- The dial face is filled (`accentSoft`) and extended by the home-indicator inset
  so the circle runs off the bottom of the screen.
- **Detent ticks** sit at the half-step midpoints (the bubbles occupy the 30°
  positions) and travel with the wheel.
- The **tonic is marked by a static index halo at the top** that does not rotate;
  bubbles travel through it. It uses the `spotlight`/`spotlightSoft` tokens, **not
  the accent**: on this screen the accent means "in the selected progression".

## Chord placement
- Outer ring = the three majors; inner ring = ii vi iii vii° (vii° at slot +2,
  continuing in fifths). The inner ring is **deliberately asymmetric** — nothing
  sits left of ii because that chord is not in the key; don't invent one to
  balance the drawing. `bubbleOpacity` is asymmetric to match (slot +2 stays solid).
- A non-diatonic chord (the Prayer set's `2maj`) never takes the solid accent
  fill: it stays outlined and its labels carry the altered spelling, so the
  diatonic ii is never shown lit in its place.

## Interaction (`keyWheel.ts`, `wheelHaptics.ts`)
- **Rotation is the only source of truth for angle** (`KeyArc`). It accumulates,
  is never reset, and the key is derived from it. Deriving positions from the key
  would make the arc jump 30° whenever key and rotation landed in different frames.
  A commit changes labels only.
- Drag math is pure worklets; the haptic policy is a pure injected-clock module.
  Both are unit-tested headless (same split as `readerSwipe.ts`). **No velocity is
  consulted**, so the wheel never flings.
- iOS ticks per 30° crossing and locks Medium on release (suppressed within 80ms
  of a tick). **Android is deliberately silent** — its motor buzzes rather than
  ticks. Don't add a fallback.

## List & display
- The whole library is **one scrolling list** grouped by set, each row showing its
  chords (`ProgressionList`). Earlier pinned-chip and picker designs, and a bass
  line under each chord, were tried and removed — don't reintroduce them.
- **Three display modes** on a switcher pinned above the list: `letters`,
  `numbers` (the stored Arabic form), `nashville` (roman numerals; case carries
  quality — `II` borrowed major, `ii` diatonic minor). An inversion keeps an Arabic
  bass in roman mode (`V/7`, not `V/VII`). The dial follows via `numberStyleFor`.
- The selected progression and display mode persist in `keyRefPrefs.ts`
  (`gc.keyref.v1`). Screen-scoped: hydrates on mount and is **not** in
  `LAUNCH_STORAGE_KEYS`. The selected key is deliberately not persisted.
