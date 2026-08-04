import { describe, expect, it } from 'vitest'
import { MATERIAL_CODEPOINTS, SF_TO_MATERIAL } from '../symbolMap'

// Guards the SymbolIcon Android pipeline against the drift that scripts/
// build-symbol-fonts.py exists to prevent: adding an SF -> Material mapping
// without re-running the build leaves the glyph absent from the subset fonts,
// which SymbolIcon renders as the "help" fallback (a dev warning, but a wrong
// icon in release). MATERIAL_CODEPOINTS is regenerated from the same run that
// writes the .ttf files, so it is a faithful proxy for what the fonts contain.

describe('symbolMap', () => {
  it('has a bundled codepoint for every mapped Material glyph', () => {
    const unbundled = Object.entries(SF_TO_MATERIAL)
      .filter(([, glyph]) => MATERIAL_CODEPOINTS[glyph.md] == null)
      .map(([sf, glyph]) => `${sf} -> ${glyph.md}`)

    expect(
      unbundled,
      'Run `python3 scripts/build-symbol-fonts.py` to subset these glyphs into the fonts',
    ).toEqual([])
  })

  it('bundles no codepoint that nothing maps to', () => {
    const used = new Set(Object.values(SF_TO_MATERIAL).map((glyph) => glyph.md))
    const orphans = Object.keys(MATERIAL_CODEPOINTS).filter((md) => !used.has(md))

    expect(orphans, 'Dead weight in the subset fonts — rebuild to drop them').toEqual([])
  })

  it('uses codepoints in the Private Use Area', () => {
    for (const [md, codepoint] of Object.entries(MATERIAL_CODEPOINTS)) {
      expect(codepoint, md).toBeGreaterThanOrEqual(0xe000)
      expect(codepoint, md).toBeLessThanOrEqual(0xf8ff)
    }
  })

  it('assigns a distinct codepoint per glyph name', () => {
    const seen = new Map<number, string>()
    const collisions: string[] = []
    for (const [md, codepoint] of Object.entries(MATERIAL_CODEPOINTS)) {
      const prior = seen.get(codepoint)
      if (prior) collisions.push(`${prior} and ${md} both at 0x${codepoint.toString(16)}`)
      else seen.set(codepoint, md)
    }
    expect(collisions).toEqual([])
  })

  it('maps the reader text-options icon used by the Daily Word control bar', () => {
    // DailyWordScreen renders <SymbolIcon name="textformat" /> for the reader
    // settings sheet; Android needs text_format present to avoid the fallback.
    expect(SF_TO_MATERIAL['textformat']).toEqual({ md: 'text_format', filled: false })
    expect(MATERIAL_CODEPOINTS.text_format).toBe(0xe165)
  })
})
