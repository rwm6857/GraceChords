import type { Passage } from './types'

export function toggleSelection(current: Set<number>, verse: number){
  const next = new Set(current)
  if (next.has(verse)) next.delete(verse)
  else next.add(verse)
  return next
}

export function sortedVerses(selection: Set<number>){
  return Array.from(selection).sort((a, b) => a - b)
}

export function formatReference(passage: Passage, verses: number[]){
  if (!verses.length) return `${passage.book} ${passage.chapter}`
  const runs = compressRuns(verses)
  const body = runs.map(({ start, end }) => (
    start === end ? `${start}` : `${start}-${end}`
  )).join(', ')
  return `${passage.book} ${passage.chapter}:${body}`
}

export function formatPassageLabel(passage: Passage){
  const book = shortBook(passage.book)
  if (!passage.range) return `${book} ${passage.chapter}`
  const { start, end } = passage.range
  if (end === null) return `${book} ${passage.chapter}:${start}-`
  if (start === end) return `${book} ${passage.chapter}:${start}`
  return `${book} ${passage.chapter}:${start}-${end}`
}

export function buildCopyText(passage: Passage, verses: number[], verseMap: Record<string, string>){
  if (!verses.length) return ''
  const ordered = verses.filter((v) => verseMap[String(v)] != null)
  const lines = ordered.map((v) => `"${verseMap[String(v)]}"`)
  const reference = formatReference(passage, verses)
  return [...lines, '', `${reference} (ESV).`].join('\n')
}

function compressRuns(verses: number[]){
  const ordered = [...verses].sort((a, b) => a - b)
  const runs: { start: number, end: number }[] = []
  for (const v of ordered){
    const last = runs[runs.length - 1]
    if (!last || v > last.end + 1){
      runs.push({ start: v, end: v })
    } else {
      last.end = v
    }
  }
  return runs
}

function shortBook(book: string){
  if (book === 'Psalms') return 'Ps'
  if (book === 'Song of Solomon') return 'Song'
  return book
}
