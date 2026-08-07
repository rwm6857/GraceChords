import { describe, expect, it } from 'vitest'
import {
  darkColors,
  darkContrastBoost,
  lightColors,
  lightContrastBoost,
  typography,
  type ThemeColors,
} from '@gracechords/tokens/native'

// The contrast facts this app's colour choices rest on, pinned.
//
// 1.0.1 promoted ~120 sites off `muted` and ~19 off `accent`-as-text because those
// tokens sit below WCAG 1.4.3 on the backgrounds they are actually used on. That
// reasoning is invisible in the diff — every changed line just says `sec` instead
// of `muted` — so a later retune of `sec` or `textAccent` could silently undo the
// whole batch with nothing failing. These tests are that alarm.
//
// Pure arithmetic over the real token module; no RN, no rendering.

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
  const raw = hex.replace('#', '')
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw
  const channels = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
  const linear = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

/** WCAG 2.1 contrast ratio, 1–21. */
export function contrastRatio(fg: string, bg: string): number {
  const a = luminance(fg)
  const b = luminance(bg)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** WCAG 1.4.3: 4.5:1 normally, 3:1 for large text (≥24px, or ≥18.66px bold). */
const NORMAL_TEXT = 4.5
const LARGE_TEXT = 3
/** WCAG 1.4.11, for icons and controls that carry meaning. */
const NON_TEXT = 3

const MODES: Array<{ name: string; colors: ThemeColors; boost: Partial<ThemeColors> }> = [
  { name: 'light', colors: lightColors, boost: lightContrastBoost },
  { name: 'dark', colors: darkColors, boost: darkContrastBoost },
]

/** Every surface body text is drawn on. */
const BACKGROUNDS = ['bg', 'surface', 'surfaceAlt'] as const

describe('contrastRatio', () => {
  it('matches known reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1)
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5)
    // Order must not matter.
    expect(contrastRatio('#15619A', '#F5F7F9')).toBeCloseTo(contrastRatio('#F5F7F9', '#15619A'), 10)
  })
})

describe.each(MODES)('$name mode', ({ colors, boost }) => {
  // The load-bearing assertion of the whole 1.0.1 accessibility batch. `sec` is
  // what ~120 sites were promoted TO; if it ever drifts under 4.5:1 on any surface,
  // that promotion silently stopped working.
  it.each(BACKGROUNDS)('sec clears normal-text contrast on %s', (bg) => {
    expect(contrastRatio(colors.sec, colors[bg])).toBeGreaterThanOrEqual(NORMAL_TEXT)
  })

  // What the 19 accent-as-text sites were promoted to. It is also the web app's
  // link colour (`--gc-link` in tokens.css), which is why it is the right token.
  it.each(BACKGROUNDS)('textAccent clears normal-text contrast on %s', (bg) => {
    expect(contrastRatio(colors.textAccent, colors[bg])).toBeGreaterThanOrEqual(NORMAL_TEXT)
  })

  it('ink clears normal-text contrast everywhere', () => {
    for (const bg of BACKGROUNDS) {
      expect(contrastRatio(colors.ink, colors[bg])).toBeGreaterThanOrEqual(NORMAL_TEXT)
    }
  })

  // The ramp's ORDER is the invariant, not any single number: ink is the most
  // legible, sec sits below it, muted below that. This is what makes `muted` a
  // meaningful "de-emphasised" token rather than a second `sec` — and it is the
  // reason the fix was to move sites off `muted` rather than to brighten `muted`
  // until it passed, which would have collapsed two levels into one.
  it('keeps the text ramp ordered ink > sec > muted', () => {
    const on = (c: string) => contrastRatio(c, colors.bg)
    expect(on(colors.ink)).toBeGreaterThan(on(colors.sec))
    expect(on(colors.sec)).toBeGreaterThan(on(colors.muted))
  })

  // Why `muted` is still correct only for decorative and disabled use.
  //
  // Note the surfaces: it fails on `surface` and `surfaceAlt` in BOTH modes, which
  // is where muted text actually lives (cards, sheets, chips, search fields). Dark
  // mode on `bg` alone reaches 4.80 — the one combination that passes, and the
  // reason "dark mode is fine" is a tempting but wrong summary.
  it.each(['surface', 'surfaceAlt'] as const)(
    'muted is below normal-text contrast on %s',
    (bg) => {
      expect(contrastRatio(colors.muted, colors[bg])).toBeLessThan(NORMAL_TEXT)
    },
  )

  // Justifies leaving accent-as-ICON and large accent text alone: both are held to
  // 3:1, which accent already clears.
  it.each(BACKGROUNDS)('accent clears the 3:1 non-text floor on %s', (bg) => {
    expect(contrastRatio(colors.accent, colors[bg])).toBeGreaterThanOrEqual(NON_TEXT)
    expect(contrastRatio(colors.accent, colors[bg])).toBeGreaterThanOrEqual(LARGE_TEXT)
  })

  it('danger clears normal-text contrast on bg and surface', () => {
    expect(contrastRatio(colors.danger, colors.bg)).toBeGreaterThanOrEqual(NORMAL_TEXT)
    expect(contrastRatio(colors.danger, colors.surface)).toBeGreaterThanOrEqual(NORMAL_TEXT)
  })

  it('textAccent stays legible on the accentSoft chips it is used on', () => {
    expect(contrastRatio(colors.textAccent, colors.accentSoft)).toBeGreaterThanOrEqual(NORMAL_TEXT)
  })

  // Increase Contrast may only ever strengthen. A boost that weakened a token
  // would be worse than no boost at all.
  it('the Increase-Contrast overlay never lowers contrast', () => {
    for (const key of Object.keys(boost) as Array<keyof ThemeColors>) {
      const boosted = boost[key]
      if (typeof boosted !== 'string' || !boosted.startsWith('#')) continue
      const base = colors[key]
      if (typeof base !== 'string' || !base.startsWith('#')) continue
      expect(contrastRatio(boosted, colors.bg)).toBeGreaterThanOrEqual(
        contrastRatio(base, colors.bg) - 0.001,
      )
    }
  })

  it('lifts muted over the normal-text floor when Increase Contrast is on', () => {
    const boostedMuted = boost.muted as string
    expect(contrastRatio(boostedMuted, colors.bg)).toBeGreaterThanOrEqual(NORMAL_TEXT)
  })
})

describe('light mode specifics', () => {
  it('muted fails on bg too — unlike dark mode, which reaches 4.80 there', () => {
    expect(contrastRatio(lightColors.muted, lightColors.bg)).toBeLessThan(NORMAL_TEXT)
    expect(contrastRatio(darkColors.muted, darkColors.bg)).toBeGreaterThanOrEqual(NORMAL_TEXT)
  })

  it('muted fails even the 3:1 large-text floor, so no size exempts it', () => {
    // This is why the classification has no "large muted text is fine" category:
    // in light mode there is no font size at which `muted` becomes compliant.
    expect(contrastRatio(lightColors.muted, lightColors.bg)).toBeLessThan(LARGE_TEXT)
  })

  it('records white-on-accent as the accepted deviation it is', () => {
    // Deliberately NOT raised: iOS system blue ships near 3.6:1, and #1F84C9
    // cascades to apps/web, apps/studio, store assets and the brand monogram.
    // Pinned so a change to `accent` is a conscious act, not a side effect.
    const ratio = contrastRatio(lightColors.onAccent, lightColors.accent)
    expect(ratio).toBeGreaterThanOrEqual(NON_TEXT)
    expect(ratio).toBeLessThan(NORMAL_TEXT)
  })
})

describe('typography ramp vs the large-text threshold', () => {
  // 24px at any weight, or 18.66px at ≥700, qualifies for the relaxed 3:1 ratio.
  const isLargeText = (fontSize: number, fontWeight: string) =>
    fontSize >= 24 || (fontSize >= 18.66 && Number(fontWeight) >= 700)

  it('only largeTitle qualifies as large text; the rest are held to 4.5:1', () => {
    // Worth pinning because it is easy to assume otherwise: `rowTitle` is 16.5/600
    // and `sectionHeader` 13/700, so neither gets the relaxed ratio, and a
    // semibold 600 is not "bold" for this purpose either way.
    const large = Object.entries(typography)
      .filter(([, s]) => isLargeText(s.fontSize, s.fontWeight))
      .map(([name]) => name)
    expect(large).toStrictEqual(['largeTitle'])
  })

  it('largeTitle is drawn in ink, so its relaxed ratio never has to be relied on', () => {
    for (const colors of [lightColors, darkColors]) {
      expect(contrastRatio(colors.ink, colors.bg)).toBeGreaterThanOrEqual(NORMAL_TEXT)
    }
  })
})
