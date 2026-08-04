// Positioned chord-sheet text → a ChordPro draft.
//
// Extractor-agnostic on purpose: the input is positioned text, never a PDF. Studio
// produces it natively with PDFKit (Import/PDFTextExtractor.swift) and hands it over
// the JavaScriptCore bridge; a web importer could produce the same shape from pdf.js
// without touching this file.
//
// Ported from the `scripts/ingest` CLI deleted in 236657bcd (recoverable at
// bd0bf206). Three of its behaviours were defects and are fixed here rather than
// carried over — each is marked FIX at the site.

import { SECTION_PRESETS } from '../chordpro/editing'
import { parseChordProOrLegacy } from '../chordpro/parser'

// MARK: - Input contract

export type ExtractedWord = {
  text: string
  /** Left edge, page points. */
  x: number
  /** TOP edge, page points, increasing DOWNWARD. See `ExtractedLine.y`. */
  y: number
  w: number
  h: number
  /** UTF-16 offset of this word's first character within its line's `text`. */
  start: number
  /** UTF-16 offset one past its last character. */
  end: number
  /**
   * Left edge of each character, page points; length `end - start`.
   *
   * Present only when the extractor both measured and validated it — which it
   * attempts only for lyric words long enough to be eligible for mid-word chord
   * insertion. Absent means "snap to the word start", so a measurement the
   * extractor could not trust degrades placement instead of corrupting it.
   */
  charX?: number[]
}

export type ExtractedLine = {
  text: string
  words: ExtractedWord[]
  x: number
  /**
   * TOP edge in a top-down space: y increases downward from the top of the crop
   * box. So `a` is above `b` iff `a.y < b.y`, and the line-to-line pitch is
   * `b.y - a.y`. The extractor flips PDF user space (y-up) before emitting.
   */
  y: number
  w: number
  h: number
  /** Modal point size of the line's text runs, when the extractor could read it. */
  fontSize?: number
  isBold?: boolean
  /** 0-based page index. */
  page: number
  /**
   * 0-based column within the page, or null for a line spanning the gutter
   * (title band, centered footer).
   */
  column?: number | null
  /**
   * First line of a page or of a column. The pitch preceding such a line is a
   * layout artifact, not a stanza break.
   */
  startsBlock: boolean
}

export type ExtractedPage = {
  index: number
  width: number
  height: number
  /** 1 or 2. Detected per page — a chart may change layout on its second page. */
  columnCount: number
  /**
   * False when the extractor could not make sense of the page's columns (three
   * or more candidate gutters, a nested table). Chord/lyric pairing is skipped
   * for such a page: a chord line stamped onto the wrong lyric line looks
   * plausible, whereas one left standing above its lyrics is obvious.
   */
  layoutTrusted: boolean
}

export type ExtractedDocument = {
  /** Already in reading order: page ascending, then title band, then column-major. */
  lines: ExtractedLine[]
  pages: ExtractedPage[]
  /** Self-checks that fired during extraction. Each costs confidence. */
  diagnostics?: string[]
}

// MARK: - Output contract

export type ImportWarningCode =
  | 'no_title'
  | 'no_key'
  | 'no_sections'
  | 'no_chords'
  | 'unpaired_chords'
  | 'suspicious_placement'
  | 'boundary_break'
  | 'two_column'
  | 'layout_untrusted'
  | 'extractor'

export type ImportWarning = { code: ImportWarningCode; message: string }

export type SongDraft = {
  title?: string
  key?: string
  artist?: string
  /** Digits only, matching `SongForm.tempo`. */
  tempo?: string
  timeSignature?: string
  /** The body, ready for `SongForm.chordproContent`. Never carries {title}/{key}. */
  chordpro: string
  /** 0–100. Studio shows the warnings below a threshold. */
  confidence: number
  warnings: ImportWarning[]
  stats: {
    sections: number
    chords: number
    lyricLines: number
    /** Chords that wanted a mid-word position and had to fall back. */
    suspiciousInsertions: number
    /** Chord lines that could not be paired with lyrics. */
    unpairedChordLines: number
  }
}

// MARK: - Chord tokens

const TOKEN_PATTERNS = [
  'maj', 'min', 'm', 'dim', 'aug', 'sus2', 'sus4', 'sus',
  'add13', 'add11', 'add9', 'add',
  '13', '11', '9', '7', '6', '5', '4', '2',
]

/**
 * Bars, rhythm slashes and repeat marks. Common on chord lines and meaningless as
 * chords, so they count against neither the chord nor the lyric side of the
 * classifier — the old version counted a `|` as a non-chord token and could tip a
 * genuine chord line into 'lyrics'.
 */
const RX_NOISE = /^(\|{1,2}|:\|{1,2}|\|{1,2}:|%|x\d+|\(x\d+\)|\/+|-+|\.+)$/i

export function normalizeAccidentals(input: string): string {
  return input.replace(/[♯＃]/g, '#').replace(/[♭]/g, 'b')
}

export function normalizeChordToken(input: string): string {
  const trimmed = normalizeAccidentals(input.trim())
  if (!trimmed) return ''

  const upper = trimmed.toUpperCase()
  if (upper === 'N.C.' || upper === 'NC' || upper === 'N.C') return 'N.C.'

  const match = trimmed.match(/^([A-Ga-g])([#b]?)(.*)$/)
  if (!match) return trimmed

  const root = match[1].toUpperCase() + match[2]
  let rest = match[3]

  let bass = ''
  const slashIndex = rest.indexOf('/')
  if (slashIndex !== -1) {
    bass = rest.slice(slashIndex + 1)
    rest = rest.slice(0, slashIndex)
  }

  let normalizedBass = ''
  if (bass) {
    const bassMatch = normalizeAccidentals(bass).match(/^([A-Ga-g])([#b]?)$/)
    normalizedBass = bassMatch ? `/${bassMatch[1].toUpperCase()}${bassMatch[2]}` : `/${bass}`
  }

  return `${root}${rest.toLowerCase()}${normalizedBass}`
}

export function isChordToken(input: string): boolean {
  const trimmed = normalizeAccidentals(input.trim())
  if (!trimmed) return false

  const upper = trimmed.toUpperCase()
  if (upper === 'N.C.' || upper === 'NC' || upper === 'N.C') return true

  const match = trimmed.match(/^([A-Ga-g])([#b]?)(.*)$/)
  if (!match) return false

  let rest = match[3]
  if (!rest) return true

  const slashIndex = rest.indexOf('/')
  if (slashIndex !== -1) {
    const bass = rest.slice(slashIndex + 1)
    if (!/^[A-Ga-g][#b]?$/.test(bass)) return false
    rest = rest.slice(0, slashIndex)
  }

  let remaining = rest.toLowerCase()
  while (remaining.length > 0) {
    const token = TOKEN_PATTERNS.find((pattern) => remaining.startsWith(pattern))
    if (!token) return false
    remaining = remaining.slice(token.length)
  }
  return true
}

export function isChordLineNoise(input: string): boolean {
  return RX_NOISE.test(input.trim())
}

/** Chord tokens in a line of text, with their character offsets. */
export function extractChordTokens(line: string): { token: string; index: number }[] {
  const tokens: { token: string; index: number }[] = []
  const regex = /\S+/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(line)) !== null) {
    if (isChordToken(match[0])) {
      tokens.push({ token: normalizeChordToken(match[0]), index: match.index })
    }
  }
  return tokens
}

// MARK: - Line classification

export type LineType = 'chords' | 'lyrics' | 'heading' | 'blank'

// Wrapped in brackets or parentheses, or bare, with an optional number and an
// optional trailing colon: `Verse 1`, `[VERSE 1]`, `(Chorus)`, `CHORUS:`. The
// bracketed uppercase form is what GraceChords' own PDF export draws, and it is
// the most common convention in the wild — the old ingest CLI accepted only the
// bare form, which is why every heading in a GraceChords-exported chart imported
// as a lyric line.
// Wrapped in brackets or parentheses, or bare, with an optional number, an optional
// trailing colon, and an optional performance note: `Verse 1`, `[VERSE 1]`,
// `(Chorus)`, `CHORUS:`, `Intro (2x)`, `Intro (2x) (Riff)`. The bracketed upper-case
// form is what GraceChords' own PDF export draws; the `(2x)` suffix is what
// PraiseCharts draws. The old ingest CLI accepted only the bare unannotated form,
// which is why headings in both of those imported as lyric lines.
const RX_HEADING =
  /^[[(]?\s*(verse|chorus|pre[-\s]?chorus|bridge|intro|outro|tag|interlude|refrain|ending)(?:\s+(\d+))?\s*[.:]?\s*[\])]?(?:\s*\([^)]{1,12}\))*\s*$/i

export type ClassifyHints = {
  isBold?: boolean
  fontSize?: number
  /** Modal font size for the page, used to spot an emphasised chord line. */
  pageFontSize?: number
}

export function classifyLine(text: string, hints: ClassifyHints = {}): LineType {
  const trimmed = text.trim()
  if (!trimmed) return 'blank'
  if (RX_HEADING.test(trimmed)) return 'heading'

  const tokens = trimmed.split(/\s+/)
  let chordCount = 0
  let noiseCount = 0
  let wordishCount = 0
  for (const token of tokens) {
    if (isChordLineNoise(token)) {
      noiseCount += 1
      continue
    }
    if (isChordToken(token)) {
      chordCount += 1
      continue
    }
    if (/[a-zA-Z]/.test(token)) wordishCount += 1
  }

  const effective = tokens.length - noiseCount
  // A line of pure rhythm slashes is a chord line with no named chords.
  if (effective === 0 && noiseCount > 0) return 'chords'
  if (chordCount === 0) return 'lyrics'

  const chordRatio = chordCount / Math.max(1, effective)
  if (chordRatio >= 0.6 && wordishCount <= 2) return 'chords'

  // FIX: the typographic signal the old classifier ignored. Chord lines are very
  // often bold or set smaller than the lyrics, which is enough to resolve the
  // marginal cases the token ratio alone gets wrong (a chord line carrying an
  // annotation like "Intro 2x", a lyric line that happens to open with "A").
  const emphasised =
    hints.isBold === true ||
    (hints.fontSize != null &&
      hints.pageFontSize != null &&
      hints.fontSize < hints.pageFontSize * 0.95)
  if (emphasised && chordRatio >= 0.4 && wordishCount <= 2) return 'chords'

  return 'lyrics'
}

// MARK: - Headings → directives

export type SectionDirective = { directive: string; label: string }

const HEADING_PRESET: Record<string, string> = {
  verse: 'Verse',
  chorus: 'Chorus',
  'pre-chorus': 'Pre-Chorus',
  prechorus: 'Pre-Chorus',
  'pre chorus': 'Pre-Chorus',
  bridge: 'Bridge',
  intro: 'Intro',
  outro: 'Outro',
  ending: 'Outro',
  tag: 'Tag',
  interlude: 'Interlude',
  refrain: 'Chorus',
}

/**
 * A bare heading → the directive/label pair to emit.
 *
 * FIX: the old version emitted `{soi}`, `{soo}` and `{sot}`, none of which the
 * parser accepts — `RX_SHORT_DIR` covers only sov/eov/soc/eoc/sob/eob, so intro,
 * outro and tag headings were silently dropped. Long form only, and the
 * directive/label mapping comes from core's own SECTION_PRESETS so that Pre-Chorus
 * and Interlude land as NAMED CHORUSES here exactly as they do from the editor's
 * section buttons.
 */
export function headingToDirective(heading: string): SectionDirective | null {
  const match = RX_HEADING.exec(heading.trim())
  if (!match) return null

  const presetLabel = HEADING_PRESET[match[1].toLowerCase().replace(/\s+/g, '-')]
  const preset = SECTION_PRESETS.find((p) => p.label === presetLabel)
  if (!preset) return null

  const number = match[2]
  return {
    directive: preset.directive,
    label: number ? `${preset.sectionLabel} ${number}` : preset.sectionLabel,
  }
}

// MARK: - Page furniture and header

const KEY_BODY = String.raw`([A-G][b#♭♯]?\s*(?:m|min|minor|maj|major)?)`
const RX_KEY_PAREN = new RegExp(String.raw`^\(\s*key\s*(?:of\b|:|-)?\s*${KEY_BODY}\s*\)$`, 'i')
const RX_KEY_BARE = new RegExp(String.raw`^key\s*(?:of\b|:|-|—)?\s*${KEY_BODY}\s*$`, 'i')
const RX_URL = /(https?:\/\/|www\.)\S+/i
const RX_DOMAIN = /\b[a-z0-9-]+\.(com|org|net|church|co|io|us|info|ca|uk|gov|edu)\b/i
const RX_EMAIL = /\b\S+@\S+\.[A-Za-z]{2,}\b/
const RX_PAGE = /^\s*page\s*\d+(\s*of\s*\d+)?\s*$/i
const RX_COPYRIGHT = /(©|\(c\)\s*\d{4}|copyright|all rights reserved|ccli)/i
// The footer GraceChords' own PDF export draws (apps/web/src/config/disclaimer.ts,
// `getPdfFooterDisclaimer`). Matched on the two stable phrases rather than the whole
// sentence so a wording tweak does not silently stop stripping it. Worth its own
// pattern because it makes a GraceChords-exported chart round-trip back in, which is
// the one case where the importer's input is known exactly.
const RX_DISCLAIMER = /property of their respective owners|personal worship and educational use/i

/** Running heads, page numbers, CCLI and copyright lines. */
export function isPageFurniture(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  return (
    RX_URL.test(trimmed) ||
    RX_DOMAIN.test(trimmed) ||
    RX_EMAIL.test(trimmed) ||
    RX_PAGE.test(trimmed) ||
    RX_COPYRIGHT.test(trimmed) ||
    RX_DISCLAIMER.test(trimmed)
  )
}

function parseKeyLine(text: string): string | undefined {
  const trimmed = text.trim()
  const match = RX_KEY_PAREN.exec(trimmed) || RX_KEY_BARE.exec(trimmed)
  if (!match) return undefined
  const parts = /^([A-Ga-g])([#b]?)\s*(.*)$/.exec(normalizeAccidentals(match[1]))
  if (!parts) return undefined
  const root = parts[1].toUpperCase() + parts[2].toLowerCase()
  return /^m(in|inor)?$/i.test(parts[3]) ? `${root}m` : root
}

function isLikelyAuthorLine(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (parseKeyLine(trimmed)) return false
  if (/[{}]/.test(trimmed)) return false
  if (/[0-9]/.test(trimmed)) return false
  if (classifyLine(trimmed) !== 'lyrics') return false
  // Real credit lines are slash- or ampersand-separated lists of several people
  // ("Leeland / Arr. Cliff Duren / Mason Brown"), so the old 6-word cap rejected
  // most of them. Separators are not counted toward the limit.
  const words = trimmed
    .replace(/^(words?|music|by|and)\s+/i, '')
    .split(/\s+/)
    .filter((w) => !/^[/&,·|-]+$/.test(w))
  if (words.length < 2 || words.length > 12) return false
  return words.filter((w) => /^[A-Z]/.test(w)).length >= 2
}

// Metadata written inline on a details line rather than on one of its own:
// `Key: E · Tempo: 68 · Time: 4/4`. Scanned wherever it appears, because real charts
// pack it onto a line that also carries a URL or a credit — and requiring the whole
// line to be the key threw all of it away.
const RX_KEY_ANYWHERE = /\bkey\s*[:\-–]\s*([A-G][b#♭♯]?\s*(?:m|min|minor|maj|major)?)(?![a-z])/i
const RX_TEMPO_ANYWHERE = /\btempo\s*[:\-–]\s*(\d{2,3})\b/i
const RX_TIME_ANYWHERE = /\btime\s*(?:sig(?:nature)?)?\s*[:\-–]?\s*(\d{1,2}\s*\/\s*\d{1,2})/i

export type SongMetadataHints = {
  key?: string
  tempo?: string
  timeSignature?: string
  /**
   * Lines a value was read out of. They are details, not lyrics, so the body drops
   * them — otherwise a credits line carrying `Tempo: 78` became the song's first
   * verse.
   */
  consumed: Set<string>
}

/**
 * Key, tempo and time signature from anywhere in the head of page 1.
 *
 * Run BEFORE furniture stripping. On a real chart the details line reads
 * `www.praisecharts.com/74161  Key: A · Tempo: 72 · Time: 4/4` — one line carrying
 * both a URL and every piece of metadata worth having, so stripping it as furniture
 * first (which is correct for the body) silently discarded the key too.
 */
export function extractMetadataHints(lines: ExtractedLine[], headerBottom: number): SongMetadataHints {
  const hints: SongMetadataHints = { consumed: new Set() }
  // Selected by POSITION on page 1, not by index into the reading order. On a
  // two-column chart the details line often sits in the right half of the header, and
  // column-major ordering drops it forty lines into the document — a leading-lines
  // scan looked right and found nothing.
  for (const line of lines) {
    if (line.page !== 0 || line.y > headerBottom) continue
    if (!line.text.trim()) continue

    let took = false
    if (!hints.key) {
      const match = RX_KEY_ANYWHERE.exec(line.text)
      if (match) {
        hints.key = normalizeKey(match[1])
        took = true
      }
    }
    if (!hints.tempo) {
      const match = RX_TEMPO_ANYWHERE.exec(line.text)
      if (match) {
        hints.tempo = match[1]
        took = true
      }
    }
    if (!hints.timeSignature) {
      const match = RX_TIME_ANYWHERE.exec(line.text)
      if (match) {
        hints.timeSignature = match[1].replace(/\s+/g, '')
        took = true
      }
    }
    if (took) hints.consumed.add(line.text)
  }
  return hints
}

function normalizeKey(raw: string): string | undefined {
  const parts = /^([A-Ga-g])([#b]?)\s*(.*)$/.exec(normalizeAccidentals(raw.trim()))
  if (!parts) return undefined
  const root = parts[1].toUpperCase() + parts[2].toLowerCase()
  return /^m(in|inor)?$/i.test(parts[3]) ? `${root}m` : root
}

export type HeaderResult = {
  title?: string
  key?: string
  artist?: string
  /** Indices into the line array that the header consumed. */
  consumed: Set<number>
}

/**
 * Title, key and author from the head of page 1.
 *
 * FIX: the old version scanned the head of a flat line list, so on a multi-page
 * chart it could take page 2's first lyric as the title. Page 1 only, and a
 * gutter-spanning line (`column == null`) is preferred, since that is what a title
 * is on a two-column chart.
 */
export function extractHeader(lines: ExtractedLine[], pageFontSize: number | undefined): HeaderResult {
  const consumed = new Set<number>()
  const candidates: number[] = []
  for (let i = 0; i < lines.length && candidates.length < 6; i += 1) {
    const line = lines[i]
    if (line.page !== 0) break
    if (!line.text.trim()) continue
    candidates.push(i)
  }
  if (candidates.length === 0) return { consumed }

  let title: string | undefined
  let titleIndex = -1

  const eligible = candidates.filter((i) => {
    const text = lines[i].text.trim()
    if (isPageFurniture(text)) return false
    if (parseKeyLine(text)) return false
    if (text.length > 80 || text.includes('{') || text.includes('}')) return false
    return classifyLine(text) !== 'chords'
  })

  // A title is typeset large, and on a two-column chart it spans the gutter.
  const oversized = eligible.filter(
    (i) => pageFontSize != null && (lines[i].fontSize ?? 0) > pageFontSize * 1.25,
  )
  const spanning = (oversized.length ? oversized : eligible).filter((i) => lines[i].column == null)
  const pool = spanning.length ? spanning : oversized.length ? oversized : eligible
  if (pool.length) {
    titleIndex = pool.reduce((best, i) => ((lines[i].fontSize ?? 0) > (lines[best].fontSize ?? 0) ? i : best), pool[0])
    title = lines[titleIndex].text.trim()
    consumed.add(titleIndex)
  }

  let key: string | undefined
  let artist: string | undefined
  for (const i of candidates) {
    if (i === titleIndex) continue
    const text = lines[i].text.trim()
    if (!key) {
      const parsed = parseKeyLine(text)
      if (parsed) {
        key = parsed
        consumed.add(i)
        continue
      }
    }
    if (!artist && i > titleIndex && isLikelyAuthorLine(text)) {
      artist = text.replace(/^(words?\s+(and|&)\s+music\s+by|by)\s+/i, '').trim()
      consumed.add(i)
    }
  }

  return { title, key, artist, consumed }
}

// MARK: - Vertical rhythm

function modeOf(values: number[], binSize = 0.5): number | null {
  if (values.length === 0) return null
  const bins = new Map<number, number[]>()
  for (const v of values) {
    const bin = Math.round(v / binSize)
    const bucket = bins.get(bin)
    if (bucket) bucket.push(v)
    else bins.set(bin, [v])
  }
  let best: number[] = []
  for (const bucket of bins.values()) {
    if (bucket.length > best.length) best = bucket
  }
  if (best.length === 0) return null
  return best.reduce((a, b) => a + b, 0) / best.length
}

/** Modal point size across the page, for the "is this line emphasised" test. */
export function pageFontSize(lines: ExtractedLine[]): number | undefined {
  const sizes = lines.map((l) => l.fontSize).filter((s): s is number => s != null && s > 0)
  const mode = modeOf(sizes, 0.5)
  return mode ?? undefined
}

/**
 * Body leading: the top-to-top pitch of consecutive body lines.
 *
 * FIX: the old rule keyed off the MEDIAN inter-line gap, which is the least stable
 * statistic available here — chord-sheet pitches form two clusters (tight
 * chord→lyric, normal lyric→next) at roughly 50/50, so the median lands in the
 * valley between them. Pairs whose upper line is a chord line are excluded
 * outright, which removes the tight cluster by construction rather than trying to
 * separate it afterwards, and the mode of what remains is the body leading.
 */
export function bodyLeading(items: { line: ExtractedLine; kind: LineType }[]): number | null {
  const wide: number[] = []
  const all: number[] = []
  for (let i = 1; i < items.length; i += 1) {
    const prev = items[i - 1]
    const cur = items[i]
    if (cur.line.startsBlock) continue
    if (cur.line.page !== prev.line.page) continue
    if ((cur.line.column ?? null) !== (prev.line.column ?? null)) continue
    const pitch = cur.line.y - prev.line.y
    if (!(pitch > 0)) continue
    all.push(pitch)
    if (prev.kind !== 'chords') wide.push(pitch)
  }
  if (wide.length >= 4) return modeOf(wide)
  return modeOf(all)
}

// MARK: - Alignment

export type AlignmentResult = {
  line: string
  inserted: number
  suspiciousInsertions: number
}

const RX_WORD = /[A-Za-z0-9'’]+/g

function wordSpans(line: string): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = []
  let match: RegExpExecArray | null
  RX_WORD.lastIndex = 0
  while ((match = RX_WORD.exec(line)) !== null) {
    spans.push({ start: match.index, end: match.index + match[0].length })
  }
  return spans
}

function isWordChar(char: string): boolean {
  return /[A-Za-z0-9'’]/.test(char)
}

/**
 * Shortest word a chord may be inserted inside. Also the threshold for calling a
 * fallback "suspicious": below it, the word start is the only possible position, so
 * landing there is correct rather than a compromise. The extractor uses the same
 * number to decide which words are worth measuring per character.
 */
export const MID_WORD_MINIMUM_LENGTH = 5

/** Mid-word insertion is only ever allowed on a long word, well away from both edges. */
function midWordAllowed(line: string, offset: number, span: { start: number; end: number }): boolean {
  const length = span.end - span.start
  if (length < MID_WORD_MINIMUM_LENGTH) return false
  if (offset - span.start < 2) return false
  if (span.end - offset < 2) return false
  if (span.start > 0 && line[span.start - 1] === '-') return false
  if (span.end < line.length && line[span.end] === '-') return false
  // Never split at a hyphen: "wonder[G]-ful" reads as a chord change that isn't
  // there, and the hyphen is where a chord is most likely to look mis-set.
  if (line[offset] === '-' || line[offset - 1] === '-') return false
  return true
}

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * A chord line with no lyrics under it, rebuilt as a chord-only ChordPro line
 * with its original horizontal spacing: `[G]        [C]        [D]`.
 *
 * Not `{instrumental: G C D}`, which reads naturally but is wrong here: the
 * parser treats an instrumental directive as a STANDALONE section
 * (`insertStandaloneSection`), so nesting one inside `{start_of_intro}` ejects it
 * and leaves the Intro empty. A chord-only line stays in its section, and
 * rebuilding the columns from the word rects means the reconstruction looks like
 * the page it came from rather than three chords crammed together.
 */
function chordOnlyLine(line: ExtractedLine): { text: string; count: number } {
  const chordWords = line.words
    .filter((w) => isChordToken(w.text))
    .slice()
    .sort((a, b) => a.x - b.x)
  if (chordWords.length === 0) {
    const tokens = extractChordTokens(line.text)
    return { text: tokens.map((t) => `[${t.token}]`).join(' '), count: tokens.length }
  }

  const advances = line.words.filter((w) => w.w > 0 && w.text.length > 0).map((w) => w.w / w.text.length)
  const charWidth = advances.length ? median(advances) : 0
  const left = chordWords[0].x

  let out = ''
  let column = 0
  for (const word of chordWords) {
    const target = charWidth > 0 ? Math.round((word.x - left) / charWidth) : column
    const pad = out === '' ? Math.max(0, target) : Math.max(1, target - column)
    out += ' '.repeat(pad) + `[${normalizeChordToken(word.text)}]`
    column += pad
  }
  return { text: out, count: chordWords.length }
}

/**
 * Chord words → inline `[C]` markers in the lyric line below them.
 *
 * FIX: the old `alignChordWordsToLyrics` mapped an index into the lyric word BOXES
 * onto an index into the lyric text word SPANS by proportional rescale
 * (`round(nearest / (boxes-1) * (spans-1))`), which is wrong whenever the two
 * counts differ — punctuation, hyphenation and PDFKit's synthesized spaces all
 * make them differ. The fix is structural rather than arithmetic: the extractor
 * tokenizes each line's own string and reports every word's offsets alongside its
 * rect, so box i and span i are the same word by construction and no rescale
 * exists to be wrong. The old geometric path also never counted a suspicious
 * insertion, leaving the confidence score blind on its best-quality input.
 */
export function alignChordWordsToLyrics(chordLine: ExtractedLine, lyricLine: ExtractedLine): AlignmentResult {
  const text = lyricLine.text
  const lyricWords = lyricLine.words.filter((w) => w.end > w.start && w.end <= text.length)
  const chordWords = chordLine.words
    .filter((w) => isChordToken(w.text))
    .slice()
    .sort((a, b) => a.x - b.x)

  if (chordWords.length === 0) return { line: text, inserted: 0, suspiciousInsertions: 0 }
  if (lyricWords.length === 0) return alignChordLineToLyrics(chordLine.text, text)

  const insertions: { offset: number; token: string }[] = []
  let suspicious = 0
  let lastIndex = 0
  let lastOffset = -1

  for (const chord of chordWords) {
    const center = chord.x + chord.w / 2

    let index = lyricWords.findIndex((w) => center >= w.x && center <= w.x + w.w)
    if (index === -1) {
      index = 0
      let bestDistance = Number.POSITIVE_INFINITY
      for (let i = 0; i < lyricWords.length; i += 1) {
        const w = lyricWords[i]
        const distance = Math.abs(center - (w.x + w.w / 2))
        if (distance < bestDistance) {
          bestDistance = distance
          index = i
        }
      }
    }
    if (index < lastIndex) index = lastIndex
    lastIndex = index

    const word = lyricWords[index]
    let offset = word.start

    // Mid-word refinement, using the per-character left edges the extractor
    // measured and validated for this word. No charX means snap to the start.
    const wantsMidWord = word.w > 0 && center > word.x + word.w * 0.25
    if (wantsMidWord) {
      const charX = word.charX
      let placed = false
      if (charX && charX.length === word.end - word.start) {
        let bestK = -1
        let bestDistance = Number.POSITIVE_INFINITY
        for (let k = 1; k < charX.length; k += 1) {
          const distance = Math.abs(center - charX[k])
          if (distance < bestDistance) {
            bestDistance = distance
            bestK = k
          }
        }
        if (bestK > 0) {
          const candidate = word.start + bestK
          if (midWordAllowed(text, candidate, { start: word.start, end: word.end })) {
            offset = candidate
            placed = true
          }
        }
      }
      // Only a word that COULD have taken a mid-word chord counts against the score.
      // On a real chart most chords sit over short words where the start is the only
      // sane position, and counting those made a good import report 53 suspicious
      // placements out of 99 chords.
      if (!placed && word.end - word.start >= MID_WORD_MINIMUM_LENGTH) suspicious += 1
    }

    // Two chords must not stack at one offset — advance to the next word instead.
    if (offset <= lastOffset) {
      const next = lyricWords.find((w) => w.start > lastOffset)
      offset = next ? next.start : text.length
    }
    lastOffset = offset

    insertions.push({ offset: Math.max(0, Math.min(offset, text.length)), token: normalizeChordToken(chord.text) })
  }

  return { line: applyInsertions(text, insertions), inserted: insertions.length, suspiciousInsertions: suspicious }
}

function applyInsertions(text: string, insertions: { offset: number; token: string }[]): string {
  let out = ''
  let cursor = 0
  for (const insertion of insertions) {
    out += text.slice(cursor, insertion.offset) + `[${insertion.token}]`
    cursor = insertion.offset
  }
  return out + text.slice(cursor)
}

/**
 * Character-ratio fallback for a chord line with no usable word geometry: place
 * each chord at the proportional position its column index implies, snapped left
 * to a word boundary. Ported as-is — it is the path that runs when geometry is
 * missing, so it must not depend on any.
 */
export function alignChordLineToLyrics(chordLine: string, lyricLine: string): AlignmentResult {
  const chords = extractChordTokens(chordLine)
  if (chords.length === 0 || lyricLine.trim().length === 0) {
    return { line: lyricLine, inserted: 0, suspiciousInsertions: 0 }
  }

  const spans = wordSpans(lyricLine)
  const insertions: { offset: number; token: string }[] = []
  let suspicious = 0
  let lastOffset = -1

  for (const chord of chords) {
    const target = Math.round((chord.index / Math.max(1, chordLine.length)) * lyricLine.length)
    const clamped = Math.max(0, Math.min(target, lyricLine.length))
    const isMidWord =
      clamped > 0 &&
      clamped < lyricLine.length &&
      isWordChar(lyricLine[clamped - 1]) &&
      isWordChar(lyricLine[clamped])

    let offset = clamped
    if (isMidWord) {
      const span = spans.find((s) => clamped > s.start && clamped < s.end)
      if (!span || !midWordAllowed(lyricLine, clamped, span)) {
        offset = span ? span.start : clamped
        suspicious += 1
      }
    } else if (spans.length) {
      const next = spans.find((s) => s.start >= clamped)
      const prev = [...spans].reverse().find((s) => s.start <= clamped)
      offset = next && prev ? (clamped - prev.start <= next.start - clamped ? prev.start : next.start) : (next ?? prev ?? { start: clamped }).start
    }

    if (offset <= lastOffset) {
      const next = spans.find((s) => s.start > lastOffset)
      offset = next ? next.start : lyricLine.length
    }
    lastOffset = offset
    insertions.push({ offset: Math.max(0, Math.min(offset, lyricLine.length)), token: chord.token })
  }

  return { line: applyInsertions(lyricLine, insertions), inserted: insertions.length, suspiciousInsertions: suspicious }
}

// MARK: - Draft assembly

type Item = {
  line: ExtractedLine
  kind: LineType
  /** Blank lines inferred from the pitch above this line. */
  blanksBefore: number
}

type Row =
  | { kind: 'heading'; directive: string; label: string; breakBefore: boolean; line: ExtractedLine }
  | { kind: 'body'; text: string; breakBefore: boolean; line: ExtractedLine }

function xOverlapRatio(a: ExtractedLine, b: ExtractedLine): number {
  if (!(a.w > 0)) return 0
  const left = Math.max(a.x, b.x)
  const right = Math.min(a.x + a.w, b.x + b.w)
  return Math.max(0, right - left) / a.w
}

export function buildSongDraft(doc: ExtractedDocument): SongDraft {
  const warnings: ImportWarning[] = []
  const pages = new Map(doc.pages.map((p) => [p.index, p]))

  // Before the furniture filter, deliberately: the details line usually carries a URL
  // alongside the key and tempo, so it is furniture for the body and the only source
  // of the metadata at the same time.
  const firstPageHeight = doc.pages.find((p) => p.index === 0)?.height ?? 792
  const hints = extractMetadataHints(
    doc.lines.filter((l) => l.text.trim().length > 0),
    firstPageHeight * 0.18,
  )

  const usable = doc.lines.filter(
    (l) => l.text.trim().length > 0 && !isPageFurniture(l.text) && !hints.consumed.has(l.text),
  )
  const modalSize = pageFontSize(usable)
  const header = extractHeader(usable, modalSize)

  const items: Item[] = usable
    .map((line, index) => ({ line, index }))
    .filter(({ index }) => !header.consumed.has(index))
    .map(({ line }) => ({
      line,
      kind: classifyLine(line.text, {
        isBold: line.isBold,
        fontSize: line.fontSize,
        pageFontSize: modalSize,
      }),
      blanksBefore: 0,
    }))

  const leading = bodyLeading(items)
  for (let i = 1; i < items.length; i += 1) {
    const prev = items[i - 1].line
    const cur = items[i].line
    // The pitch across a column or page boundary is a layout artifact.
    if (cur.startsBlock || cur.page !== prev.page || (cur.column ?? null) !== (prev.column ?? null)) continue
    const pitch = cur.y - prev.y
    if (!(pitch > 0)) continue
    if (leading && leading > 0) {
      items[i].blanksBefore = Math.max(0, Math.round(pitch / leading) - 1)
    } else {
      // Too few samples for a mode. Fall back to a scale-invariant test rather
      // than an absolute point floor, which fails on a 7pt condensed chart.
      const scale = Math.max(prev.fontSize ?? 0, cur.fontSize ?? 0, 1)
      items[i].blanksBefore = pitch > scale * 1.8 ? 1 : 0
    }
  }

  const rows: Row[] = []
  let chordCount = 0
  let lyricLineCount = 0
  let suspicious = 0
  let unpaired = 0
  let chordLineCount = 0
  let pairedChordLines = 0

  let i = 0
  while (i < items.length) {
    const item = items[i]
    const breakBefore = item.blanksBefore > 0

    if (item.kind === 'heading') {
      const directive = headingToDirective(item.line.text)
      if (directive) {
        rows.push({ kind: 'heading', ...directive, breakBefore, line: item.line })
        i += 1
        continue
      }
      // A heading shape the preset table does not cover — keep the text as lyrics
      // rather than dropping the line.
      rows.push({ kind: 'body', text: item.line.text.trim(), breakBefore, line: item.line })
      i += 1
      continue
    }

    if (item.kind === 'chords') {
      chordLineCount += 1
      const next = items[i + 1]
      const page = pages.get(item.line.page)
      const pairable =
        next != null &&
        next.kind === 'lyrics' &&
        page?.layoutTrusted !== false &&
        next.line.page === item.line.page &&
        (next.line.column ?? null) === (item.line.column ?? null) &&
        !next.line.startsBlock &&
        next.blanksBefore === 0 &&
        xOverlapRatio(item.line, next.line) >= 0.5 &&
        (leading == null || next.line.y - item.line.y <= leading * 1.15) &&
        // A chord line with far more chords than the lyric line has words is an
        // instrumental run that happens to sit above something short, not a pair.
        // Forcing the match piled four of seven chords onto the last character of a
        // five-character line on a real chart; refusing keeps the run on its own line
        // with its spacing intact, which is what it is.
        item.line.words.filter((w) => isChordToken(w.text)).length <=
          Math.max(2, next.line.words.length + 1)

      if (pairable && next) {
        const aligned = alignChordWordsToLyrics(item.line, next.line)
        rows.push({ kind: 'body', text: aligned.line, breakBefore, line: item.line })
        chordCount += aligned.inserted
        suspicious += aligned.suspiciousInsertions
        lyricLineCount += 1
        pairedChordLines += 1
        i += 2
        continue
      }

      // Unpairable: keep the chords on their own line rather than guessing a
      // lyric line for them. Obvious to spot and one keystroke to fix, which is
      // the trade this whole design makes at every boundary.
      const only = chordOnlyLine(item.line)
      if (only.count > 0) {
        rows.push({ kind: 'body', text: only.text, breakBefore, line: item.line })
        chordCount += only.count
        unpaired += 1
      }
      i += 1
      continue
    }

    rows.push({ kind: 'body', text: item.line.text.trim(), breakBefore, line: item.line })
    lyricLineCount += 1
    i += 1
  }

  // A body row opening a column or page, with no heading of its own, continues the
  // section it was torn from. That is what keeps a straddling verse in one piece,
  // at the cost of losing a genuine break that lands exactly on the boundary — so
  // name each such boundary rather than leaving the trade silent.
  const boundaries: string[] = []
  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r]
    if (!row.line.startsBlock || row.kind === 'heading') continue
    const prev = rows[r - 1].line
    boundaries.push(
      row.line.page !== prev.page
        ? `the top of page ${row.line.page + 1}`
        : `the second column of page ${row.line.page + 1}`,
    )
  }

  const hasHeadings = rows.some((r) => r.kind === 'heading')
  let { chordpro, sections } = serialize(rows, hasHeadings)

  // Safety net: never hand the editor a body the parser cannot read. If the
  // wrapped form does not survive a round trip, fall back to the unwrapped one,
  // which has no directives to be unbalanced.
  try {
    parseChordProOrLegacy(chordpro)
  } catch {
    const plain = serialize(rows, false)
    chordpro = plain.chordpro
    sections = 0
    warnings.push({
      code: 'no_sections',
      message: 'Section markers could not be generated — the lyrics were imported without them.',
    })
  }

  if (!header.title) warnings.push({ code: 'no_title', message: 'No title found — add one before saving.' })
  const key = header.key ?? hints.key
  if (!key) warnings.push({ code: 'no_key', message: 'No key found — set it before publishing.' })
  if (!hasHeadings) {
    warnings.push({ code: 'no_sections', message: 'No section headings found — add them with the toolbar.' })
  }
  if (chordCount === 0) {
    warnings.push({ code: 'no_chords', message: 'No chords were recognised.' })
  }
  if (unpaired > 0) {
    warnings.push({
      code: 'unpaired_chords',
      message: `${unpaired} chord ${unpaired === 1 ? 'line' : 'lines'} could not be matched to lyrics and were left on their own.`,
    })
  }
  if (suspicious > 0) {
    warnings.push({
      code: 'suspicious_placement',
      message: `${suspicious} ${suspicious === 1 ? 'chord' : 'chords'} placed at the start of a word rather than mid-word.`,
    })
  }
  for (const boundary of boundaries) {
    warnings.push({ code: 'boundary_break', message: `A section break at ${boundary} may be missing.` })
  }
  if (doc.pages.some((p) => p.columnCount > 1)) {
    warnings.push({ code: 'two_column', message: 'Two-column layout — check the chord placement.' })
  }
  for (const page of doc.pages.filter((p) => !p.layoutTrusted)) {
    warnings.push({
      code: 'layout_untrusted',
      message: `Page ${page.index + 1}'s layout could not be read — its chords were left on their own lines.`,
    })
  }
  for (const diagnostic of doc.diagnostics ?? []) {
    warnings.push({ code: 'extractor', message: diagnostic })
  }

  const mappingRate = chordLineCount > 0 ? pairedChordLines / chordLineCount : 1
  let confidence = 100
  if (lyricLineCount === 0) confidence -= 30
  if (chordCount === 0) confidence -= 15
  if (mappingRate < 0.6) confidence -= 20
  if (suspicious > 5) confidence -= 10
  if (unpaired > 2) confidence -= 10
  if (!hasHeadings) confidence -= 15
  if (!header.title) confidence -= 10
  if (!key) confidence -= 5
  if (doc.pages.some((p) => !p.layoutTrusted)) confidence -= 15
  confidence -= Math.min(20, (doc.diagnostics?.length ?? 0) * 5)

  return {
    title: header.title,
    key,
    tempo: hints.tempo,
    timeSignature: hints.timeSignature,
    artist: header.artist,
    chordpro,
    confidence: Math.max(0, Math.min(100, confidence)),
    warnings,
    stats: {
      sections,
      chords: chordCount,
      lyricLines: lyricLineCount,
      suspiciousInsertions: suspicious,
      unpairedChordLines: unpaired,
    },
  }
}

/**
 * Rows → a ChordPro body.
 *
 * With at least one heading present, every block is wrapped: the parser's legacy
 * bare-header dialect is exclusive with the directive dialect (it sets `hasEnv`
 * and then stops consulting plain headers), so a half-wrapped body reads worse
 * than either. With no headings at all, nothing is wrapped and the warning says so.
 */
function serialize(rows: Row[], hasHeadings: boolean): { chordpro: string; sections: number } {
  if (!hasHeadings) {
    const out: string[] = []
    for (const row of rows) {
      if (row.kind !== 'body') continue
      if (row.breakBefore && out.length) out.push('')
      out.push(row.text)
    }
    return { chordpro: out.join('\n').trim(), sections: 0 }
  }

  type Block = { directive?: string; label?: string; lines: string[] }
  const blocks: Block[] = []
  let current: Block | null = null

  // Once a heading has been seen, ONLY a heading starts a section; a gap inside one
  // becomes a blank line in the body.
  //
  // Splitting on every gap is what a chart looks like, not what it means. Real charts
  // space their stanzas generously, so gap-splitting turned one eight-line verse into
  // three sections and labelled two of them `Verse 4` and `Verse 7` — labels that
  // appear nowhere on the page. Content BEFORE the first heading still splits on gaps,
  // since there is no heading there to group it.
  let sawHeading = false
  for (const row of rows) {
    if (row.kind === 'heading') {
      current = { directive: row.directive, label: row.label, lines: [] }
      blocks.push(current)
      sawHeading = true
      continue
    }
    if (!current || (row.breakBefore && !sawHeading)) {
      current = { lines: [] }
      blocks.push(current)
    } else if (row.breakBefore && current.lines.length) {
      current.lines.push('')
    }
    current.lines.push(row.text)
  }

  // Numbering runs across the whole document, so a Verse 3 at the top of page 2 is
  // not renumbered back to 1.
  let verseNumber = 0
  const used = new Set<string>()
  for (const block of blocks) {
    if (block.label) used.add(block.label)
  }

  const out: string[] = []
  let sections = 0
  for (const block of blocks) {
    if (block.lines.length === 0) continue
    let directive = block.directive
    let label = block.label
    if (!directive) {
      directive = 'verse'
      do {
        verseNumber += 1
        label = `Verse ${verseNumber}`
      } while (used.has(label))
      used.add(label)
    } else if (directive === 'verse' && label === 'Verse') {
      do {
        verseNumber += 1
        label = `Verse ${verseNumber}`
      } while (used.has(label))
      used.add(label)
    }
    if (out.length) out.push('')
    out.push(`{start_of_${directive}: ${label}}`)
    out.push(...block.lines)
    out.push(`{end_of_${directive}}`)
    sections += 1
  }

  return { chordpro: out.join('\n').trim(), sections }
}
