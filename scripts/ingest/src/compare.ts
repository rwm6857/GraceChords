import { basename, join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { ingestFile, listSupportedFiles } from './ingest.js'
import type { IngestResult } from './ingest.js'
import { slugifyTitle } from './utils/slug.js'
import { fileExists } from './utils/fs.js'
import { normalizeChordToken } from './utils/chords.js'

export type CompareOptions = {
  inputsDir: string
  songsDir: string
  stagingRoot: string
  doIngest: boolean
  strictChords?: boolean
  compareChords?: boolean
  compareLyrics?: boolean
  compareSections?: boolean
}

export type CompareResult = {
  slug: string
  title: string
  status: 'matched' | 'missing_actual' | 'skipped'
  expectedPath?: string
  actualPath?: string
  matchScore?: number
  lineMatchRate?: number
  chordMismatchCount?: number
  diff?: string
  mismatchCounts?: {
    chordPlacement: number
    chordQuality: number
    sectionOrder: number
    lyricText: number
  }
  mismatchSamples?: Array<{
    type: 'chordPlacement' | 'chordQuality' | 'sectionOrder' | 'lyricText'
    expected: string
    actual: string
  }>
}

function extractTitle(chordpro: string): string | null {
  const match = chordpro.match(/\{\s*title\s*:\s*([^}]+)\}/i)
  return match ? match[1].trim() : null
}

function extractChordTokens(line: string, strictChords: boolean): string[] {
  const tokens: string[] = []
  const regex = /\[([^\]]+)\]/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(line)) !== null) {
    tokens.push(normalizeChordForCompare(match[1], strictChords))
  }
  return tokens
}

function normalizeLines(text: string): string[] {
  return text.split(/\r?\n/).map((line) => line.trimEnd())
}

const SECTION_START = new Map<string, string>([
  ['sov', 'verse'],
  ['soc', 'chorus'],
  ['sob', 'bridge'],
  ['sot', 'tag'],
  ['soi', 'intro'],
  ['soo', 'outro'],
  ['sop', 'pre-chorus'],
  ['verse', 'verse'],
  ['chorus', 'chorus'],
  ['bridge', 'bridge'],
  ['tag', 'tag'],
  ['intro', 'intro'],
  ['outro', 'outro'],
  ['prechorus', 'pre-chorus'],
  ['pre-chorus', 'pre-chorus'],
  ['start_of_verse', 'verse'],
  ['start_of_chorus', 'chorus'],
  ['start_of_bridge', 'bridge'],
  ['start_of_tag', 'tag'],
  ['start_of_intro', 'intro'],
  ['start_of_outro', 'outro'],
  ['start_of_pre_chorus', 'pre-chorus'],
  ['start_of_prechorus', 'pre-chorus']
])

const SECTION_END = new Set<string>([
  'eov',
  'eoc',
  'eob',
  'eot',
  'eoi',
  'eoo',
  'eop',
  'end_of_verse',
  'end_of_chorus',
  'end_of_bridge',
  'end_of_tag',
  'end_of_intro',
  'end_of_outro',
  'end_of_pre_chorus',
  'end_of_prechorus'
])

function normalizeChordForCompare(token: string, strictChords: boolean): string {
  const normalized = normalizeChordToken(token)
  if (strictChords) return normalized

  const upper = normalized.toUpperCase()
  if (upper === 'N.C.' || upper === 'NC' || upper === 'N.C') return 'N.C.'

  const base = normalized.split('/')[0]
  const match = base.match(/^([A-G])([#b]?)(.*)$/)
  if (!match) return base
  const root = match[1].toUpperCase() + match[2]
  const modifiers = (match[3] || '').toLowerCase()
  let quality = ''
  if (modifiers.startsWith('min')) quality = 'm'
  else if (modifiers.startsWith('m') && !modifiers.startsWith('maj')) quality = 'm'
  else if (modifiers.startsWith('maj')) quality = 'maj'
  else if (modifiers.startsWith('dim')) quality = 'dim'
  else if (modifiers.startsWith('aug')) quality = 'aug'
  return `${root}${quality}`
}

function normalizeContentLine(line: string, strictChords: boolean): string {
  const withChords = line.replace(/\[([^\]]+)\]/g, (_, token) => {
    const normalized = normalizeChordForCompare(token, strictChords)
    return normalized ? `[${normalized}]` : ''
  })
  return withChords.replace(/\s+/g, ' ').trim()
}

function sectionTypeFromLine(line: string): string | null {
  const heading = line.trim().toLowerCase()
  const match = heading.match(/^(verse|chorus|pre[- ]?chorus|bridge|tag|intro|outro)(\s+\d+)?[.:]?$/i)
  if (!match) return null
  const type = match[1].toLowerCase().replace(' ', '-')
  return type === 'prechorus' ? 'pre-chorus' : type
}

function sectionTypeFromDirective(line: string): string | null {
  const match = line.match(/^\{([^}]+)\}$/)
  if (!match) return null
  const content = match[1].trim()
  const token = content.split(/\s+/)[0].toLowerCase()
  const tokenParts = token.split(':')
  const baseToken = tokenParts[0]
  if (SECTION_END.has(baseToken)) return '__end__'
  const label = content.slice(token.length).trim()
  if (label && /pre[-\s]?chorus/i.test(label)) return 'pre-chorus'
  if (SECTION_START.has(baseToken)) return SECTION_START.get(baseToken) || null
  if (token.includes(':')) return null
  return SECTION_START.get(baseToken) || null
}

function normalizeLyricsLine(line: string): string {
  return line
    .replace(/\[([^\]]+)\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeLyricsKey(line: string): string {
  return normalizeLyricsLine(line).toLowerCase()
}

function chordPlacementsForLine(line: string, strictChords: boolean): string {
  const tokens: Array<{ chord: string; wordIndex: number }> = []
  const regex = /\[([^\]]+)\]/g
  let match: RegExpExecArray | null
  let cursor = 0
  let wordCount = 0

  const countWords = (segment: string) => {
    const matches = segment.match(/[A-Za-z0-9'’]+/g)
    return matches ? matches.length : 0
  }

  while ((match = regex.exec(line)) !== null) {
    const before = line.slice(cursor, match.index)
    wordCount += countWords(before)
    const chord = normalizeChordForCompare(match[1], strictChords)
    if (chord) {
      tokens.push({ chord, wordIndex: wordCount })
    }
    cursor = match.index + match[0].length
  }

  if (tokens.length === 0) return ''
  return tokens.map((token) => `${token.chord}@${token.wordIndex}`).join('|')
}

type SequenceLine = { raw: string; key: string }

function extractSequences(text: string, strictChords: boolean) {
  const lines = normalizeLines(text)
  const sections: SequenceLine[] = []
  const lyrics: SequenceLine[] = []
  const chords: SequenceLine[] = []
  const combined: SequenceLine[] = []

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (/^\(key of\s+[A-G][#b]?(?:m)?\)$/i.test(line)) continue
    if (line.startsWith('#')) continue
    if (/disclaimer/i.test(line) && /gracechords/i.test(line)) continue

    const directiveType = sectionTypeFromDirective(line)
    if (directiveType) {
      if (directiveType !== '__end__') {
        const raw = `[SECTION:${directiveType}]`
        sections.push({ raw, key: raw })
        combined.push({ raw, key: raw })
      }
      continue
    }

    if (line.startsWith('{') && line.endsWith('}')) {
      continue
    }

    const headingType = sectionTypeFromLine(line)
    if (headingType) {
      const raw = `[SECTION:${headingType}]`
      sections.push({ raw, key: raw })
      combined.push({ raw, key: raw })
      continue
    }

    const lyricLine = normalizeLyricsLine(line)
    if (lyricLine) {
      const raw = lyricLine
      lyrics.push({ raw, key: normalizeLyricsKey(line) })
      combined.push({ raw: normalizeContentLine(line, strictChords), key: normalizeLyricsKey(line) })
    }

    const chordLine = chordPlacementsForLine(line, strictChords)
    if (chordLine) chords.push({ raw: chordLine, key: chordLine })
  }

  return { sections, lyrics, chords, combined }
}

function compareSequences(expectedLines: SequenceLine[], actualLines: SequenceLine[]) {
  const m = expectedLines.length
  const n = actualLines.length
  if (m === 0 && n === 0) {
    return { matchScore: 100, lineMatchRate: 1, diff: '', mismatchCount: 0 }
  }
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      if (expectedLines[i].key === actualLines[j].key) {
        dp[i][j] = dp[i + 1][j + 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
      }
    }
  }

  type Op = { type: 'equal' | 'remove' | 'add'; line: string }
  const ops: Op[] = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (expectedLines[i].key === actualLines[j].key) {
      if (expectedLines[i].raw === actualLines[j].raw) {
        ops.push({ type: 'equal', line: expectedLines[i].raw })
      } else {
        ops.push({ type: 'remove', line: expectedLines[i].raw })
        ops.push({ type: 'add', line: actualLines[j].raw })
      }
      i += 1
      j += 1
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'remove', line: expectedLines[i].raw })
      i += 1
    } else {
      ops.push({ type: 'add', line: actualLines[j].raw })
      j += 1
    }
  }
  while (i < m) {
    ops.push({ type: 'remove', line: expectedLines[i].raw })
    i += 1
  }
  while (j < n) {
    ops.push({ type: 'add', line: actualLines[j].raw })
    j += 1
  }

  let matchCount = 0
  let mismatchCount = 0
  const diffLines: string[] = []
  let inMismatch = false
  for (let idx = 0; idx < ops.length; idx += 1) {
    const op = ops[idx]
    if (op.type === 'equal') {
      matchCount += 1
      diffLines.push(`  ${op.line}`)
      inMismatch = false
      continue
    }

    if (op.type === 'remove') {
      diffLines.push(`- ${op.line}`)
    } else {
      diffLines.push(`+ ${op.line}`)
    }

    if (!inMismatch) {
      mismatchCount += 1
      inMismatch = true
    }
  }

  const maxLines = Math.max(m, n)
  const lineMatchRate = maxLines > 0 ? matchCount / maxLines : 1
  const matchScore = Math.max(0, Math.round(lineMatchRate * 100))

  return { matchScore, lineMatchRate, diff: diffLines.join('\n'), mismatchCount }
}

export function compareChordPro(
  expected: string,
  actual: string,
  options: { strictChords?: boolean; compareChords?: boolean; compareLyrics?: boolean; compareSections?: boolean } = {}
): {
  matchScore: number
  lineMatchRate: number
  chordMismatchCount: number
  diff: string
  mismatchCounts: {
    chordPlacement: number
    chordQuality: number
    sectionOrder: number
    lyricText: number
  }
  mismatchSamples: Array<{
    type: 'chordPlacement' | 'chordQuality' | 'sectionOrder' | 'lyricText'
    expected: string
    actual: string
  }>
} {
  const strictChords = Boolean(options.strictChords)
  const enableChords = Boolean(options.compareChords)
  const enableLyrics = Boolean(options.compareLyrics)
  const enableSections = Boolean(options.compareSections)
  const compareAll = !enableChords && !enableLyrics && !enableSections

  const sequencesExpected = extractSequences(expected, strictChords)
  const sequencesActual = extractSequences(actual, strictChords)

  const scores: number[] = []
  const lineRates: number[] = []
  let chordMismatchCount = 0
  const mismatchCounts = {
    chordPlacement: 0,
    chordQuality: 0,
    sectionOrder: 0,
    lyricText: 0
  }
  const mismatchSamples: Array<{
    type: 'chordPlacement' | 'chordQuality' | 'sectionOrder' | 'lyricText'
    expected: string
    actual: string
  }> = []
  let diff = ''

  const sectionsComparison = compareAll || enableSections
    ? compareSequences(sequencesExpected.sections, sequencesActual.sections)
    : null

  if (sectionsComparison) {
    scores.push(sectionsComparison.matchScore)
    lineRates.push(sectionsComparison.lineMatchRate)
    mismatchCounts.sectionOrder = sectionsComparison.mismatchCount
    if (!compareAll && enableSections && !enableLyrics && !enableChords) {
      diff = sectionsComparison.diff
    }
  }

  const lyricsComparison = compareAll || enableLyrics
    ? compareSequences(sequencesExpected.lyrics, sequencesActual.lyrics)
    : null

  if (lyricsComparison) {
    scores.push(lyricsComparison.matchScore)
    lineRates.push(lyricsComparison.lineMatchRate)
    mismatchCounts.lyricText = lyricsComparison.mismatchCount
    if (!compareAll && enableLyrics && !enableChords && !enableSections) {
      diff = lyricsComparison.diff
    }
  }

  const chordsComparison = compareAll || enableChords
    ? compareSequences(sequencesExpected.chords, sequencesActual.chords)
    : null

  if (chordsComparison) {
    scores.push(chordsComparison.matchScore)
    lineRates.push(chordsComparison.lineMatchRate)
    chordMismatchCount = chordsComparison.mismatchCount
    mismatchCounts.chordPlacement = chordsComparison.mismatchCount
    if (!compareAll && enableChords && !enableLyrics && !enableSections) {
      diff = chordsComparison.diff
    }
  }

  if (compareAll) {
    const combinedComparison = compareSequences(sequencesExpected.combined, sequencesActual.combined)
    diff = combinedComparison.diff
  }

  if (compareAll) {
    const sampleTypes = [
      { type: 'sectionOrder', diff: sectionsComparison?.diff || '' },
      { type: 'lyricText', diff: lyricsComparison?.diff || '' },
      { type: 'chordPlacement', diff: chordsComparison?.diff || '' }
    ] as const

    for (const entry of sampleTypes) {
      const lines = entry.diff.split('\n')
      for (let i = 0; i < lines.length - 1; i += 1) {
        const line = lines[i]
        const next = lines[i + 1]
        if (line.startsWith('- ') && next.startsWith('+ ')) {
          if (mismatchSamples.filter((sample) => sample.type === entry.type).length < 3) {
            mismatchSamples.push({
              type: entry.type,
              expected: line.slice(2),
              actual: next.slice(2)
            })
          }
          i += 1
        }
      }
    }

    if (chordsComparison) {
      const lines = chordsComparison.diff.split('\n')
      for (let i = 0; i < lines.length - 1; i += 1) {
        const line = lines[i]
        const next = lines[i + 1]
        if (line.startsWith('- ') && next.startsWith('+ ')) {
          const expectedChords = extractChordTokens(line.slice(2), strictChords)
          const actualChords = extractChordTokens(next.slice(2), strictChords)
          if (expectedChords.join('|') !== actualChords.join('|')) {
            mismatchCounts.chordQuality += 1
            if (mismatchSamples.filter((sample) => sample.type === 'chordQuality').length < 3) {
              mismatchSamples.push({
                type: 'chordQuality',
                expected: line.slice(2),
                actual: next.slice(2)
              })
            }
          }
        }
      }
    }
  }

  const matchScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
  const lineMatchRate = lineRates.length > 0 ? lineRates.reduce((a, b) => a + b, 0) / lineRates.length : 0

  return {
    matchScore,
    lineMatchRate,
    chordMismatchCount,
    diff,
    mismatchCounts,
    mismatchSamples
  }
}

export async function compareAgainstLibrary(options: CompareOptions) {
  const inputs = await listSupportedFiles(options.inputsDir)
  const results: CompareResult[] = []
  const isSkipped = (result: IngestResult): result is { skipped: true; reason: string; title: string } =>
    (result as { skipped?: boolean }).skipped === true

  for (const input of inputs) {
    const inputSlug = slugifyTitle(basename(input))
    if (!inputSlug) continue

    let stagingDir = join(options.stagingRoot, inputSlug)
    let title = inputSlug.replace(/_/g, ' ')

    if (options.doIngest) {
      const ingestResult = await ingestFile(input, {})
      if (isSkipped(ingestResult)) {
        results.push({
          slug: inputSlug,
          title: ingestResult.title || inputSlug,
          status: 'skipped'
        })
        continue
      }
      stagingDir = ingestResult.stagingDir
      title = ingestResult.title
    }

    const actualSlug = basename(stagingDir)
    const actualPath = join(stagingDir, 'normalized', `${actualSlug}.chordpro`)
    const actualExists = await fileExists(actualPath)
    let actualContent: string | null = null

    if (actualExists) {
      actualContent = await readFile(actualPath, 'utf8')
      title = extractTitle(actualContent) || title
    }

    const expectedSlug = slugifyTitle(title) || inputSlug
    const expectedPath = join(options.songsDir, `${expectedSlug}.chordpro`)
    const expectedExists = await fileExists(expectedPath)

    if (!actualExists) {
      results.push({ slug: expectedSlug, title, status: 'missing_actual', expectedPath })
      continue
    }

    if (!expectedExists) {
      results.push({ slug: expectedSlug, title, status: 'skipped', actualPath })
      continue
    }

    const expected = await readFile(expectedPath, 'utf8')
    const actual = actualContent ?? (await readFile(actualPath, 'utf8'))

    title = extractTitle(actual) || extractTitle(expected) || title
    const comparison = compareChordPro(expected, actual, {
      strictChords: options.strictChords,
      compareChords: options.compareChords,
      compareLyrics: options.compareLyrics,
      compareSections: options.compareSections
    })

    results.push({
      slug: expectedSlug,
      title,
      status: 'matched',
      expectedPath,
      actualPath,
      ...comparison
    })
  }

  return results
}
