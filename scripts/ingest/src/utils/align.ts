import { extractChordTokens, isChordToken, normalizeChordToken } from './chords.js'
import type { WordBox } from './types.js'

export type AlignmentResult = {
  line: string
  success: boolean
  suspiciousInsertions: number
}

function insertAt(input: string, index: number, value: string): string {
  return input.slice(0, index) + value + input.slice(index)
}

function isWordChar(char: string): boolean {
  return /[A-Za-z0-9'’]/.test(char)
}

type WordSpan = { start: number; end: number }

function getWordSpans(line: string): WordSpan[] {
  const spans: WordSpan[] = []
  const regex = /[A-Za-z0-9'’]+/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(line)) !== null) {
    spans.push({ start: match.index, end: match.index + match[0].length })
  }
  return spans
}

function getWordBounds(line: string, idx: number): { start: number; end: number } | null {
  if (idx <= 0 || idx >= line.length) return null
  if (!isWordChar(line[idx - 1]) || !isWordChar(line[idx])) return null

  let start = idx - 1
  while (start > 0 && isWordChar(line[start - 1])) {
    start -= 1
  }

  let end = idx
  while (end < line.length && isWordChar(line[end])) {
    end += 1
  }

  return { start, end }
}

export function snapLeftToWordBoundary(line: string, idx: number, allowMidWord = false): number {
  const length = line.length
  if (length === 0) return 0
  let index = Math.max(0, Math.min(idx, length))

  const bounds = getWordBounds(line, index)
  if (bounds) {
    if (allowMidWord) {
      const wordLength = bounds.end - bounds.start
      const leftDist = index - bounds.start
      const rightDist = bounds.end - index
      if (wordLength >= 5 && leftDist >= 2 && rightDist >= 2) {
        return index
      }
    }
    return bounds.start
  }

  let right = index
  while (right < length && !isWordChar(line[right])) {
    right += 1
  }
  if (right < length) {
    let start = right
    while (start > 0 && isWordChar(line[start - 1])) {
      start -= 1
    }
    return start
  }

  let left = index
  while (left > 0 && !isWordChar(line[left - 1])) {
    left -= 1
  }
  while (left > 0 && isWordChar(line[left - 1])) {
    left -= 1
  }

  return left
}

function shouldAllowMidWord(line: string, index: number): boolean {
  const bounds = getWordBounds(line, index)
  if (!bounds) return false
  if (bounds.start > 0 && line[bounds.start - 1] === '-') return false
  if (bounds.end < line.length && line[bounds.end] === '-') return false
  const wordLength = bounds.end - bounds.start
  const leftDist = index - bounds.start
  const rightDist = bounds.end - index
  return wordLength >= 5 && leftDist >= 2 && rightDist >= 2
}

function findSafeInsertIndex(line: string, index: number): { index: number; suspicious: boolean } {
  const clamped = Math.max(0, Math.min(index, line.length))
  const isMidWord =
    clamped > 0 &&
    clamped < line.length &&
    isWordChar(line[clamped - 1]) &&
    isWordChar(line[clamped])

  const snapped = snapLeftToWordBoundary(line, clamped, shouldAllowMidWord(line, clamped))
  return { index: snapped, suspicious: isMidWord && snapped !== clamped }
}

function findWordIndexForTarget(targetChar: number, spans: WordSpan[]): number {
  if (spans.length === 0) return -1
  for (let i = 0; i < spans.length; i += 1) {
    const span = spans[i]
    if (targetChar >= span.start && targetChar <= span.end) return i
  }
  let bestIndex = 0
  let bestDistance = Number.POSITIVE_INFINITY
  for (let i = 0; i < spans.length; i += 1) {
    const distance = Math.abs(targetChar - spans[i].start)
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = i
    }
  }
  return bestIndex
}

function computeInsertIndex(
  baseLine: string,
  targetChar: number,
  spans: WordSpan[],
  lastWordIndex: number
): { index: number; wordIndex: number; suspicious: boolean } {
  if (spans.length === 0) {
    const result = findSafeInsertIndex(baseLine, targetChar)
    return { index: result.index, wordIndex: lastWordIndex, suspicious: result.suspicious }
  }

  let wordIndex = findWordIndexForTarget(targetChar, spans)
  if (wordIndex < lastWordIndex) wordIndex = lastWordIndex
  if (wordIndex >= spans.length) wordIndex = spans.length - 1

  const span = spans[wordIndex]
  let insertionIndex = span.start
  let suspicious = false

  if (targetChar >= span.start && targetChar <= span.end) {
    const allowMid = shouldAllowMidWord(baseLine, targetChar)
    const snapped = snapLeftToWordBoundary(baseLine, targetChar, allowMid)
    insertionIndex = snapped
    if (!allowMid && snapped !== targetChar) suspicious = true
  }

  return { index: insertionIndex, wordIndex, suspicious }
}

export function alignChordLineToLyrics(chordLine: string, lyricLine: string): AlignmentResult {
  const chords = extractChordTokens(chordLine)
  if (chords.length === 0 || lyricLine.trim().length === 0) {
    return { line: lyricLine, success: false, suspiciousInsertions: 0 }
  }

  const baseLine = lyricLine
  const spans = getWordSpans(baseLine)
  let output = lyricLine
  let offset = 0
  let suspiciousInsertions = 0
  let lastWordIndex = 0

  for (const chord of chords) {
    const target = Math.round((chord.index / Math.max(1, chordLine.length)) * baseLine.length)
    const insertion = `[${chord.token}]`
    const result = computeInsertIndex(baseLine, target, spans, lastWordIndex)
    if (result.suspicious) suspiciousInsertions += 1
    output = insertAt(output, result.index + offset, insertion)
    offset += insertion.length
    lastWordIndex = result.wordIndex
  }

  return { line: output, success: true, suspiciousInsertions }
}

export function alignChordWordsToLyrics(
  chordWords: WordBox[],
  lyricWords: WordBox[],
  lyricLine: string
): AlignmentResult {
  if (chordWords.length === 0 || lyricLine.trim().length === 0) {
    return { line: lyricLine, success: false, suspiciousInsertions: 0 }
  }

  const spans = getWordSpans(lyricLine)
  const lyricCenters = lyricWords.map((word) => word.x + word.w / 2)
  const lyricMin = Math.min(...lyricWords.map((w) => w.x))
  const lyricMax = Math.max(...lyricWords.map((w) => w.x + w.w))
  const lyricWidth = Math.max(1, lyricMax - lyricMin)

  let output = lyricLine
  let offset = 0
  let suspiciousInsertions = 0
  let lastWordIndex = 0

  for (const word of chordWords) {
    if (!isChordToken(word.text)) continue
    const normalized = normalizeChordToken(word.text)
    let insertionIndex = 0

    if (spans.length > 0 && lyricCenters.length > 0) {
      const center = word.x + word.w / 2
      let nearestIndex = 0
      let bestDistance = Number.POSITIVE_INFINITY
      for (let i = 0; i < lyricCenters.length; i += 1) {
        const distance = Math.abs(center - lyricCenters[i])
        if (distance < bestDistance) {
          bestDistance = distance
          nearestIndex = i
        }
      }

      if (nearestIndex < lastWordIndex) nearestIndex = lastWordIndex
      const spanIndex =
        lyricCenters.length > 1
          ? Math.min(spans.length - 1, Math.round((nearestIndex / (lyricCenters.length - 1)) * (spans.length - 1)))
          : 0
      insertionIndex = spans[Math.max(0, spanIndex)].start
      lastWordIndex = spanIndex
    } else {
      const ratio = (word.x - lyricMin) / lyricWidth
      const target = Math.round(ratio * output.length)
      const result = findSafeInsertIndex(output, target + offset)
      insertionIndex = result.index
      if (result.suspicious) suspiciousInsertions += 1
    }

    const insertion = `[${normalized}]`
    output = insertAt(output, insertionIndex + offset, insertion)
    offset += insertion.length
  }

  return { line: output, success: true, suspiciousInsertions }
}
