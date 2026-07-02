// Build a song shape the pdf_mvp engine accepts, from a raw Supabase song row.
// The pure engine reads `sections` plus `title` and `key`/`originalKey`, and
// renders chord symbols verbatim — transposition is the caller's
// responsibility (the site does it in SongViewPage; server callers do it
// here). Extracted from workers/telegram-bot/src/pdfRender.js so the export
// Pages Function can share it; the worker still carries its own copy until it
// is refactored onto this module (follow-up).

import { parseChordProOrLegacy } from '../chordpro/parser.ts'
import { stepsBetween, transposeSymPrefer } from '../chordpro/index.js'

export function toRenderableSong(song, key) {
  const parsed = parseChordProOrLegacy(song.chordpro_content || '')
  const originalKey = song.default_key || parsed.meta?.key || ''
  const targetKey = key || originalKey
  const steps = (originalKey && targetKey) ? stepsBetween(originalKey, targetKey) : 0
  const preferFlat = /b/.test(String(targetKey))

  const sections = steps === 0 ? parsed.sections : parsed.sections.map(sec => ({
    ...sec,
    instrumental: sec.instrumental
      ? { ...sec.instrumental, chords: sec.instrumental.chords.map(s => transposeSymPrefer(s, steps, preferFlat)) }
      : undefined,
    lines: sec.lines.map(ln => ({
      ...ln,
      chords: ln.chords.map(c => ({ ...c, sym: transposeSymPrefer(c.sym, steps, preferFlat) })),
      instrumental: ln.instrumental
        ? { ...ln.instrumental, chords: ln.instrumental.chords.map(s => transposeSymPrefer(s, steps, preferFlat)) }
        : undefined,
    })),
  }))

  return {
    title: song.title,
    key: targetKey,
    originalKey,
    sections,
  }
}
