import type { Passage } from './types'

const BOOK_ALIASES: Record<string, string> = {
  psalm: 'Psalms',
  psalms: 'Psalms',
  'song of songs': 'Song of Solomon',
}

export function expandReadings(readings: string[]): Passage[] {
  return readings.flatMap((raw) => expandReading(raw)).filter(Boolean)
}

export function expandReading(raw: string): Passage[] {
  const trimmed = raw.trim()
  if (!trimmed) return []

  const digitIdx = trimmed.search(/\d/)
  if (digitIdx === -1) return []

  const rawBook = trimmed.slice(0, digitIdx).trim()
  const ref = trimmed.slice(digitIdx).trim()
  if (!rawBook || !ref) return []

  const book = canonicalBook(rawBook)
  return expandReference(book, ref)
}

function canonicalBook(rawBook: string){
  const normalized = rawBook.replace(/\s+/g, ' ').trim()
  const key = normalized.toLowerCase()
  if (BOOK_ALIASES[key]) return BOOK_ALIASES[key]
  return normalized
}

function expandReference(book: string, ref: string): Passage[] {
  // Cross-chapter with verse endpoints, e.g., 11:1-12:20
  let match = ref.match(/^(\d+):(\d+)-(\d+):(\d+)$/)
  if (match){
    const startChapter = parseInt(match[1], 10)
    const startVerse = parseInt(match[2], 10)
    const endChapter = parseInt(match[3], 10)
    const endVerse = parseInt(match[4], 10)

    if (startChapter === endChapter){
      return [{
        book,
        chapter: startChapter,
        range: { start: startVerse, end: endVerse },
      }]
    }

    return [
      { book, chapter: startChapter, range: { start: startVerse, end: null } },
      { book, chapter: endChapter, range: { start: 1, end: endVerse } },
    ]
  }

  // Single chapter verse range, e.g., 12:1-20
  match = ref.match(/^(\d+):(\d+)-(\d+)$/)
  if (match){
    const chapter = parseInt(match[1], 10)
    const start = parseInt(match[2], 10)
    const end = parseInt(match[3], 10)
    return [{
      book,
      chapter,
      range: { start, end },
    }]
  }

  // Single verse or implied single-verse range, e.g., 63:10
  match = ref.match(/^(\d+):(\d+)$/)
  if (match){
    const chapter = parseInt(match[1], 10)
    const verse = parseInt(match[2], 10)
    return [{
      book,
      chapter,
      range: { start: verse, end: verse },
    }]
  }

  // Multi-chapter (whole chapters), e.g., 126-128
  match = ref.match(/^(\d+)-(\d+)$/)
  if (match){
    const start = parseInt(match[1], 10)
    const end = parseInt(match[2], 10)
    const passages: Passage[] = []
    for (let c = start; c <= end; c += 1){
      passages.push({ book, chapter: c, range: null })
    }
    return passages
  }

  // Single full chapter
  const chapter = Number(ref)
  if (!Number.isNaN(chapter)){
    return [{ book, chapter, range: null }]
  }

  return []
}
