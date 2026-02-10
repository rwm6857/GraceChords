const BOOKS = [
  'Genesis',
  'Exodus',
  'Leviticus',
  'Numbers',
  'Deuteronomy',
  'Joshua',
  'Judges',
  'Ruth',
  '1 Samuel',
  '2 Samuel',
  '1 Kings',
  '2 Kings',
  '1 Chronicles',
  '2 Chronicles',
  'Ezra',
  'Nehemiah',
  'Esther',
  'Job',
  'Psalms',
  'Proverbs',
  'Ecclesiastes',
  'Song of Solomon',
  'Isaiah',
  'Jeremiah',
  'Lamentations',
  'Ezekiel',
  'Daniel',
  'Hosea',
  'Joel',
  'Amos',
  'Obadiah',
  'Jonah',
  'Micah',
  'Nahum',
  'Habakkuk',
  'Zephaniah',
  'Haggai',
  'Zechariah',
  'Malachi',
  'Matthew',
  'Mark',
  'Luke',
  'John',
  'Acts',
  'Romans',
  '1 Corinthians',
  '2 Corinthians',
  'Galatians',
  'Ephesians',
  'Philippians',
  'Colossians',
  '1 Thessalonians',
  '2 Thessalonians',
  '1 Timothy',
  '2 Timothy',
  'Titus',
  'Philemon',
  'Hebrews',
  'James',
  '1 Peter',
  '2 Peter',
  '1 John',
  '2 John',
  '3 John',
  'Jude',
  'Revelation',
]

const BOOK_ALIASES = {
  ps: 'Psalms',
  psa: 'Psalms',
  psalm: 'Psalms',
  psalms: 'Psalms',
  songofsongs: 'Song of Solomon',
  songofsong: 'Song of Solomon',
  songofsolomon: 'Song of Solomon',
  canticles: 'Song of Solomon',
  canticleofcanticles: 'Song of Solomon',
  revelations: 'Revelation',
  jn: 'John',
}

const BOOK_KEYS = BOOKS.map((name) => ({ name, key: normalizeBookKey(name) }))
const ALIAS_KEYS = Object.entries(BOOK_ALIASES).map(([alias, name]) => ({ name, key: normalizeBookKey(alias) }))

export function isVerseId(id){
  return typeof id === 'string' && id.startsWith('v:')
}

export function parseVerseId(id){
  if (!isVerseId(id)) return null
  const raw = String(id).slice(2).replace(/~/g, ',')
  const parsed = parseVerseReference(raw)
  if (parsed.error) return null
  return parsed
}

export function makeVerseId({ book, refKey }){
  return `v:${book} ${refKey}`.trim()
}

export function parseVerseReference(raw){
  const input = String(raw || '').trim()
  if (!input) return { error: 'Enter a verse reference.' }

  const { bookPart, refPart } = splitVerseInput(input)
  if (!bookPart || !refPart) return { error: 'Include both book and chapter/verse.' }

  const resolved = resolveBook(bookPart)
  if (resolved.error) return resolved

  const refNormalized = normalizeRef(refPart)
  const segments = parseRefSegments(refNormalized, resolved.book)
  if (!segments || !segments.length) return { error: 'Unable to parse verse reference.' }

  const refDisplay = refNormalized.replace(/,/g, ', ')
  const refKey = refNormalized.replace(/,/g, '~')
  const id = makeVerseId({ book: resolved.book, refKey })
  return {
    book: resolved.book,
    ref: refNormalized,
    refDisplay: `${resolved.book} ${refDisplay}`.trim(),
    refKey,
    id,
    segments,
  }
}

function splitVerseInput(input){
  const raw = String(input || '')
  if (!raw.trim()) return { bookPart: '', refPart: '' }
  const colonIndex = raw.indexOf(':')
  if (colonIndex > -1) {
    let i = colonIndex - 1
    while (i >= 0 && /\d/.test(raw[i])) i -= 1
    const digitStart = i + 1
    if (digitStart < colonIndex) {
      return {
        bookPart: raw.slice(0, digitStart).trim(),
        refPart: raw.slice(digitStart).trim(),
      }
    }
  }
  const match = raw.match(/\s(\d+)(?=[\s:.,-]|$)/)
  if (match && typeof match.index === 'number') {
    return {
      bookPart: raw.slice(0, match.index).trim(),
      refPart: raw.slice(match.index + 1).trim(),
    }
  }
  return { bookPart: raw.trim(), refPart: '' }
}

export function suggestBookName(raw){
  const input = String(raw || '').trim()
  if (!input) return null
  const key = normalizeBookKey(input)
  if (!key || key.length < 3) return null

  const exact = resolveBook(input)
  if (!exact.error && normalizeBookKey(exact.book) === key) return null

  const matches = findBookMatches(key)
  if (matches.length === 1) return matches[0]
  return null
}

function resolveBook(rawBook){
  const key = normalizeBookKey(rawBook)
  if (!key) return { error: 'Enter a book name.' }

  const alias = BOOK_ALIASES[key]
  if (alias) return { book: alias }

  const exact = BOOK_KEYS.find((b) => b.key === key)
  if (exact) return { book: exact.name }

  const matches = findBookMatches(key)
  if (matches.length === 1) return { book: matches[0] }
  if (matches.length > 1) return { error: `Ambiguous book name: ${rawBook}` }
  return { error: `Unknown book: ${rawBook}` }
}

function findBookMatches(key){
  const matches = []
  for (const b of BOOK_KEYS) {
    if (b.key.startsWith(key)) matches.push(b.name)
  }
  if (matches.length) return matches
  for (const a of ALIAS_KEYS) {
    if (a.key.startsWith(key)) matches.push(a.name)
  }
  return Array.from(new Set(matches))
}

function normalizeBookKey(raw){
  let cleaned = String(raw || '').trim()
  if (!cleaned) return ''
  const roman = cleaned.match(/^\s*(i{1,3})\b/i)
  if (roman) {
    const token = roman[1].toLowerCase()
    const num = token === 'i' ? '1' : token === 'ii' ? '2' : token === 'iii' ? '3' : token
    cleaned = cleaned.replace(roman[1], num)
  }
  return cleaned.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function normalizeRef(rawRef){
  return String(rawRef || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ',')
    .replace(/\s*-\s*/g, '-')
}

const SINGLE_CHAPTER_BOOKS = new Set([
  'Obadiah',
  'Philemon',
  '2 John',
  '3 John',
  'Jude',
])

function parseRefSegments(ref, book){
  const clean = String(ref || '').trim()
  if (!clean) return null
  const compact = clean.replace(/\s+/g, '')
  const hasColon = compact.includes(':')
  const parts = compact.split(',').filter(Boolean)
  const segments = []
  let currentChapter = null

  const addRange = (chapter, range) => {
    if (!chapter || Number.isNaN(chapter)) return
    if (!range) {
      segments.push({ chapter, ranges: null })
      return
    }
    const last = segments[segments.length - 1]
    if (last && last.chapter === chapter && Array.isArray(last.ranges)) {
      last.ranges.push(range)
      return
    }
    segments.push({ chapter, ranges: [range] })
  }

  if (!hasColon && SINGLE_CHAPTER_BOOKS.has(book)) {
    for (const part of parts) {
      let match = part.match(/^(\d+)-(\d+)$/)
      if (match) {
        addRange(1, { start: parseInt(match[1], 10), end: parseInt(match[2], 10) })
        continue
      }
      match = part.match(/^(\d+)$/)
      if (match) {
        addRange(1, { start: parseInt(match[1], 10), end: parseInt(match[1], 10) })
        continue
      }
      return null
    }
    return segments
  }

  for (const part of parts) {
    let match = part.match(/^(\d+):(\d+)-(\d+):(\d+)$/)
    if (match) {
      const startChapter = parseInt(match[1], 10)
      const startVerse = parseInt(match[2], 10)
      const endChapter = parseInt(match[3], 10)
      const endVerse = parseInt(match[4], 10)
      if (startChapter === endChapter) {
        addRange(startChapter, { start: startVerse, end: endVerse })
      } else {
        addRange(startChapter, { start: startVerse, end: null })
        addRange(endChapter, { start: 1, end: endVerse })
      }
      currentChapter = endChapter
      continue
    }

    match = part.match(/^(\d+):(\d+)-(\d+)$/)
    if (match) {
      const chapter = parseInt(match[1], 10)
      addRange(chapter, { start: parseInt(match[2], 10), end: parseInt(match[3], 10) })
      currentChapter = chapter
      continue
    }

    match = part.match(/^(\d+):(\d+)$/)
    if (match) {
      const chapter = parseInt(match[1], 10)
      const verse = parseInt(match[2], 10)
      addRange(chapter, { start: verse, end: verse })
      currentChapter = chapter
      continue
    }

    if (!hasColon) {
      match = part.match(/^(\d+)-(\d+)$/)
      if (match) {
        const start = parseInt(match[1], 10)
        const end = parseInt(match[2], 10)
        for (let c = start; c <= end; c += 1) addRange(c, null)
        currentChapter = end
        continue
      }

      match = part.match(/^(\d+)$/)
      if (match) {
        const chapter = parseInt(match[1], 10)
        addRange(chapter, null)
        currentChapter = chapter
        continue
      }
    }

    if (hasColon && currentChapter) {
      match = part.match(/^(\d+)-(\d+)$/)
      if (match) {
        addRange(currentChapter, { start: parseInt(match[1], 10), end: parseInt(match[2], 10) })
        continue
      }
      match = part.match(/^(\d+)$/)
      if (match) {
        const verse = parseInt(match[1], 10)
        addRange(currentChapter, { start: verse, end: verse })
        continue
      }
    }

    return null
  }

  return segments
}

export default {
  BOOKS,
  isVerseId,
  parseVerseId,
  parseVerseReference,
  suggestBookName,
  makeVerseId,
}
