// Verse-selection + copy-formatting helpers (DOM-free). Ported from
// apps/web/src/features/readings/selection.ts.

import type { Passage } from './types'

export function toggleSelection(current: Set<number>, verse: number){
  const next = new Set(current)
  if (next.has(verse)) next.delete(verse)
  else next.add(verse)
  return next
}

export function sortedVerses(selection: ReadonlySet<number>){
  return Array.from(selection).sort((a, b) => a - b)
}

export function isVerseInRange(verse: number, passage: Passage){
  if (!passage.range) return true
  if (verse < passage.range.start) return false
  if (passage.range.end == null) return true
  return verse <= passage.range.end
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

export function passageId(passage: Passage){
  if (!passage.range) return `${passage.bookNumber}|${passage.chapter}|all`
  const { start, end } = passage.range
  const suffix = end == null ? `${start}-end` : `${start}-${end}`
  return `${passage.bookNumber}|${passage.chapter}|${suffix}`
}

export function buildCopyText(
  passage: Passage,
  verses: number[],
  verseMap: Record<string, string>,
  translationLabel = 'ESV'
){
  const present = verses.filter((v) => verseMap[String(v)] != null).sort((a, b) => a - b)
  if (!present.length) return ''
  // Each contiguous run of verses becomes one quoted, prose-joined block; gaps
  // start a new block. The reference lists all runs, e.g. "Isaiah 64:1-2, 5, 7-8".
  const blocks = compressRuns(present).map(({ start, end }) => {
    const texts: string[] = []
    for (let v = start; v <= end; v++) {
      const text = verseMap[String(v)]
      if (text != null) texts.push(text)
    }
    return `"${texts.join(' ')}"`
  })
  const reference = formatReference(passage, present)
  return [...blocks, '', `${reference} (${translationLabel})`].join('\n')
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
