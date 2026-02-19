import { classifyLine } from './classify.js'
import type { ExtractedLine } from './types.js'

export type SongLanguage = 'tr' | 'en' | 'unknown'

export type SongbookSong = {
  number: number
  title: string
  language: SongLanguage
  lines: ExtractedLine[]
}

type TitleMarker = {
  index: number
  page: number
  number: number
  title: string
  language: SongLanguage
}

type SongSignals = {
  nonBlank: number
  chord: number
  heading: number
  lyric: number
}

const TITLE_RE = /^\s*(\d{1,3})\.\s+(.+?)\s*$/
const DIVIDER_RE =
  /^\s*\(?\s*(tk|tr|turkce|türkçe|turkish)\s*\)?\s*[-–—/|]+\s*\(?\s*(en|eng|english)\s*\)?\s*$|^\s*\(?\s*(en|eng|english)\s*\)?\s*[-–—/|]+\s*\(?\s*(tk|tr|turkce|türkçe|turkish)\s*\)?\s*$/i
const IGNORE_RE =
  /^(contents|içerikler|english songs|türkçe şarkılar|özel baski|special edition|this songbook belongs to|bu şarkı kitabın sahibi)\s*$/i
const TURKISH_CHAR_RE = /[çğıöşüÇĞİÖŞÜıİ]/

const EN_STOPWORDS = new Set([
  'the',
  'and',
  'you',
  'your',
  'us',
  'my',
  'me',
  'we',
  'our',
  'father',
  'king',
  'savior',
  'maker',
  'lord',
  'jesus',
  'holy',
  'praise',
  'love',
  'is',
  'are',
  'of',
  'to',
  'in',
  'for',
  'with'
])

const TR_STOPWORDS = new Set([
  've',
  'bir',
  'ben',
  'sen',
  'rab',
  'isa',
  'tanrı',
  'bana',
  'beni',
  'sana',
  'kutsal',
  'övgü',
  'övgüler',
  'için',
  'gibi',
  'yüce',
  'biz',
  'bizim',
  'kalbim',
  'sevgi',
  'haleluya'
])

function normalizeText(input: string): string {
  return input.replace(/\s+/g, ' ').trim()
}

function isDividerLine(text: string): boolean {
  return DIVIDER_RE.test(text)
}

function isIgnoredContentLine(text: string): boolean {
  const trimmed = normalizeText(text)
  if (!trimmed) return false
  if (IGNORE_RE.test(trimmed)) return true
  if (/^\d{1,3}$/.test(trimmed)) return true
  return false
}

function parseTitleMarker(line: ExtractedLine, index: number): TitleMarker | null {
  const text = normalizeText(line.text)
  const match = text.match(TITLE_RE)
  if (!match) return null

  const number = Number(match[1])
  if (!Number.isFinite(number) || number <= 0) return null

  const title = normalizeText(match[2])
  if (!title || isIgnoredContentLine(title)) return null
  if (classifyLine(title) === 'chords') return null

  return {
    index,
    page: line.page || 1,
    number,
    title,
    language: detectLanguage(title, 'lyrics')
  }
}

function tokenizedWords(text: string): string[] {
  return normalizeText(text)
    .toLowerCase()
    .split(/[^a-zA-ZçğıöşüÇĞİÖŞÜıİ']+/)
    .filter(Boolean)
}

function detectLanguage(text: string, lineType: 'heading' | 'lyrics' = 'lyrics'): SongLanguage {
  const trimmed = normalizeText(text)
  if (!trimmed) return 'unknown'

  if (TURKISH_CHAR_RE.test(trimmed)) return 'tr'

  if (lineType === 'heading') {
    if (/\b(kıta|nakarat|köprü|giriş|çıkış)\b/i.test(trimmed)) return 'tr'
    if (/\b(verse|chorus|bridge|intro|outro|tag|pre[-\s]?chorus)\b/i.test(trimmed)) return 'en'
  }

  const words = tokenizedWords(trimmed)
  if (words.length === 0) return 'unknown'

  let enCount = 0
  let trCount = 0
  for (const word of words) {
    if (EN_STOPWORDS.has(word)) enCount += 1
    if (TR_STOPWORDS.has(word)) trCount += 1
  }

  if (trCount > enCount && trCount > 0) return 'tr'
  if (enCount > trCount && enCount > 0) return 'en'
  return 'unknown'
}

function collectSignals(lines: ExtractedLine[]): SongSignals {
  let nonBlank = 0
  let chord = 0
  let heading = 0
  let lyric = 0

  for (const line of lines) {
    const text = normalizeText(line.text)
    if (!text || isIgnoredContentLine(text) || isDividerLine(text)) continue
    nonBlank += 1
    const type = classifyLine(text)
    if (type === 'chords') chord += 1
    else if (type === 'heading') heading += 1
    else if (type === 'lyrics') lyric += 1
  }

  return { nonBlank, chord, heading, lyric }
}

function hasSongSignals(lines: ExtractedLine[]): boolean {
  const stats = collectSignals(lines)
  if (stats.nonBlank < 2) return false
  if (stats.chord >= 1 && stats.lyric >= 1) return true
  if (stats.heading >= 1 && stats.lyric >= 1) return true
  return stats.lyric >= 4
}

function trimBlankEdges(lines: ExtractedLine[]): ExtractedLine[] {
  let start = 0
  while (start < lines.length) {
    if (normalizeText(lines[start].text)) break
    start += 1
  }

  let end = lines.length - 1
  while (end >= start) {
    if (normalizeText(lines[end].text)) break
    end -= 1
  }

  if (end < start) return []
  return lines.slice(start, end + 1)
}

function dedupeTitles(markers: TitleMarker[]): TitleMarker[] {
  const seen = new Set<string>()
  const output: TitleMarker[] = []
  for (const marker of markers) {
    const key = `${marker.number}::${marker.title.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    output.push(marker)
  }
  return output
}

function selectVariantIndex(
  language: SongLanguage,
  variants: Array<{ language: SongLanguage }>,
  active: number
): number {
  if (language !== 'unknown') {
    const matching = variants
      .map((variant, index) => ({ variant, index }))
      .filter((entry) => entry.variant.language === language)
    if (matching.length === 1) return matching[0].index
  }
  return active
}

function dominantLanguage(lines: ExtractedLine[]): SongLanguage {
  let tr = 0
  let en = 0
  for (const line of lines) {
    const text = normalizeText(line.text)
    if (!text || isDividerLine(text) || isIgnoredContentLine(text)) continue
    const type = classifyLine(text)
    if (type === 'chords' || type === 'blank') continue
    const language = detectLanguage(text, type === 'heading' ? 'heading' : 'lyrics')
    if (language === 'tr') tr += 1
    else if (language === 'en') en += 1
  }
  if (tr > en && tr > 0) return 'tr'
  if (en > tr && en > 0) return 'en'
  return 'unknown'
}

function mergeMarkerLanguages(markersByNumber: Map<number, TitleMarker[]>, number: number): Set<SongLanguage> {
  const set = new Set<SongLanguage>()
  const markers = markersByNumber.get(number) || []
  for (const marker of markers) {
    if (marker.language !== 'unknown') set.add(marker.language)
  }
  return set
}

function routeLinesToVariants(
  lines: ExtractedLine[],
  variants: Array<{ title: string; language: SongLanguage }>
): SongbookSong[] {
  const normalizedLines = trimBlankEdges(lines)
  if (normalizedLines.length === 0) return []

  if (variants.length <= 1) {
    const single = trimBlankEdges(normalizedLines)
    if (!hasSongSignals(single)) return []
    return [{ number: 0, title: variants[0].title, language: variants[0].language, lines: single }]
  }

  const grouped = variants.map(() => [] as ExtractedLine[])
  let active = variants.findIndex((variant) => variant.language === 'tr')
  if (active < 0) active = 0
  let pendingChords: ExtractedLine[] = []

  for (const line of normalizedLines) {
    const text = normalizeText(line.text)
    if (!text) {
      if (pendingChords.length > 0) {
        grouped[active].push(...pendingChords)
        pendingChords = []
      }
      if (grouped[active].length > 0) grouped[active].push(line)
      continue
    }

    if (isIgnoredContentLine(text) || isDividerLine(text)) {
      if (pendingChords.length > 0) {
        grouped[active].push(...pendingChords)
        pendingChords = []
      }
      if (variants.length === 2) {
        active = active === 0 ? 1 : 0
      }
      continue
    }

    const type = classifyLine(text)
    if (type === 'chords') {
      pendingChords.push(line)
      continue
    }

    const language = detectLanguage(text, type === 'heading' ? 'heading' : 'lyrics')
    active = selectVariantIndex(language, variants, active)
    if (pendingChords.length > 0) {
      grouped[active].push(...pendingChords)
      pendingChords = []
    }
    grouped[active].push(line)
  }

  if (pendingChords.length > 0) {
    grouped[active].push(...pendingChords)
  }

  return grouped
    .map((linesForVariant, index) => ({
      number: 0,
      title: variants[index].title,
      language: variants[index].language,
      lines: trimBlankEdges(linesForVariant)
    }))
    .filter((candidate) => hasSongSignals(candidate.lines))
}

export function splitSongbookLines(lines: ExtractedLine[]): SongbookSong[] {
  if (lines.length === 0) return []

  const indexed = lines.map((line) => ({ ...line, page: line.page || 1 }))
  const markers = dedupeTitles(
    indexed
      .map((line, index) => parseTitleMarker(line, index))
      .filter((marker): marker is TitleMarker => marker !== null)
  )
  if (markers.length === 0) return []

  const markerIndexSet = new Set(markers.map((marker) => marker.index))
  const markersByNumber = new Map<number, TitleMarker[]>()
  markers.forEach((marker) => {
    const list = markersByNumber.get(marker.number) || []
    list.push(marker)
    markersByNumber.set(marker.number, list)
  })

  const pageToIndexes = new Map<number, number[]>()
  indexed.forEach((line, index) => {
    const list = pageToIndexes.get(line.page) || []
    list.push(index)
    pageToIndexes.set(line.page, list)
  })
  const orderedPages = Array.from(pageToIndexes.keys()).sort((a, b) => a - b)
  const markerIndexLookup = new Map<number, TitleMarker>()
  markers.forEach((marker) => markerIndexLookup.set(marker.index, marker))
  const songLinesByNumber = new Map<number, ExtractedLine[]>()

  const appendSegment = (number: number | null, segmentIndexes: number[]): number | null => {
    if (number === null || segmentIndexes.length === 0) return null
    const segmentLines = segmentIndexes
      .map((index) => lines[index])
      .filter((line) => !isIgnoredContentLine(normalizeText(line.text)))
    if (segmentLines.length === 0) return null
    if (!hasSongSignals(segmentLines)) return null

    const list = songLinesByNumber.get(number) || []
    list.push(...segmentLines)
    songLinesByNumber.set(number, list)
    return number
  }

  let carryNumber: number | null = null

  for (const page of orderedPages) {
    const pageIndexes = pageToIndexes.get(page) || []
    const pageMarkers = pageIndexes
      .filter((index) => markerIndexSet.has(index))
      .map((index) => markerIndexLookup.get(index)!)
      .sort((a, b) => a.index - b.index)

    if (pageMarkers.length === 0) {
      const assigned = appendSegment(carryNumber, pageIndexes)
      if (assigned !== null) carryNumber = assigned
      continue
    }

    const pageMarkerPositions = pageMarkers.map((marker) => pageIndexes.indexOf(marker.index))
    const firstMarkerPosition = pageMarkerPositions[0]
    const firstMarkerRatio = firstMarkerPosition / Math.max(1, pageIndexes.length - 1)

    const beforeFirst = pageIndexes.filter((index) => index < pageMarkers[0].index && !markerIndexSet.has(index))
    if (beforeFirst.length > 0) {
      let targetNumber: number | null
      if (carryNumber === null) {
        targetNumber = pageMarkers[0].number
      } else if (firstMarkerRatio > 0.58) {
        targetNumber = pageMarkers[0].number
      } else if (firstMarkerRatio < 0.18) {
        targetNumber = carryNumber
      } else {
        const segmentLanguage = dominantLanguage(beforeFirst.map((index) => lines[index]))
        const carryLanguages = mergeMarkerLanguages(markersByNumber, carryNumber)
        const firstLanguages = mergeMarkerLanguages(markersByNumber, pageMarkers[0].number)
        if (
          segmentLanguage !== 'unknown' &&
          firstLanguages.has(segmentLanguage) &&
          !carryLanguages.has(segmentLanguage)
        ) {
          targetNumber = pageMarkers[0].number
        } else if (
          segmentLanguage !== 'unknown' &&
          carryLanguages.has(segmentLanguage) &&
          !firstLanguages.has(segmentLanguage)
        ) {
          targetNumber = carryNumber
        } else {
          targetNumber = carryNumber
        }
      }
      const assigned = appendSegment(targetNumber, beforeFirst)
      if (assigned !== null) carryNumber = assigned
    }

    for (let i = 0; i < pageMarkers.length - 1; i += 1) {
      const left = pageMarkers[i]
      const right = pageMarkers[i + 1]
      const between = pageIndexes.filter(
        (index) => index > left.index && index < right.index && !markerIndexSet.has(index)
      )
      if (between.length === 0) continue

      let target = left.number
      if (left.number !== right.number) {
        const segmentLanguage = dominantLanguage(between.map((index) => lines[index]))
        const leftLanguages = mergeMarkerLanguages(markersByNumber, left.number)
        const rightLanguages = mergeMarkerLanguages(markersByNumber, right.number)

        if (
          segmentLanguage !== 'unknown' &&
          rightLanguages.has(segmentLanguage) &&
          !leftLanguages.has(segmentLanguage)
        ) {
          target = right.number
        } else if (
          segmentLanguage !== 'unknown' &&
          leftLanguages.has(segmentLanguage) &&
          !rightLanguages.has(segmentLanguage)
        ) {
          target = left.number
        } else {
          const segmentFirst = normalizeText(lines[between[0]].text)
          if (isDividerLine(segmentFirst)) target = right.number
        }
      }

      const assigned = appendSegment(target, between)
      if (assigned !== null) carryNumber = assigned
    }

    const last = pageMarkers[pageMarkers.length - 1]
    const afterLast = pageIndexes.filter((index) => index > last.index && !markerIndexSet.has(index))
    const assigned = appendSegment(last.number, afterLast)
    if (assigned !== null) {
      carryNumber = assigned
    } else {
      carryNumber = last.number
    }
  }

  const output: SongbookSong[] = []
  const orderedNumbers = Array.from(new Set(markers.map((marker) => marker.number))).sort((a, b) => a - b)

  for (const number of orderedNumbers) {
    const markerTitles = dedupeTitles(markersByNumber.get(number) || [])
    const content = trimBlankEdges(songLinesByNumber.get(number) || [])
    if (!hasSongSignals(content)) continue

    const variants = markerTitles.map((marker) => ({ title: marker.title, language: marker.language }))
    if (variants.length === 0) {
      output.push({
        number,
        title: `Song ${number}`,
        language: 'unknown',
        lines: content
      })
      continue
    }

    const routed = routeLinesToVariants(content, variants)
    if (routed.length === 0) {
      output.push({
        number,
        title: variants[0].title,
        language: variants[0].language,
        lines: content
      })
      continue
    }

    routed.forEach((entry) => {
      output.push({
        number,
        title: entry.title,
        language: entry.language,
        lines: entry.lines
      })
    })
  }

  return output.sort((a, b) => a.number - b.number || a.title.localeCompare(b.title))
}
