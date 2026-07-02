// Canonical Protestant 66-book chapter counts, indexed by book number (1–66),
// matching the book numbering used by the R2 chapter layout
// (`<dataRoot>/<bookNumber>/<chapter>.json`) and the M'Cheyne plan. Pure,
// DOM-free. Added for the offline-download layer, which must enumerate every
// chapter of a translation up front (the R2 manifest lists translations, not
// their chapter counts). Translations that omit a chapter simply 404 on that
// file — the downloader tolerates that — so this table is the upper bound.

/** Chapter count per book, index 0 unused so index === book number (1–66). */
export const BOOK_CHAPTER_COUNTS: readonly number[] = [
  0,
  50, 40, 27, 36, 34, 24, 21, 4, 31, 24, // 1–10  Genesis–2 Kings
  22, 25, 29, 36, 10, 13, 10, 42, 150, 31, // 11–20 1 Kings–Proverbs
  12, 8, 66, 52, 5, 48, 12, 14, 3, 9, // 21–30 Ecclesiastes–Amos
  1, 4, 7, 3, 3, 3, 2, 14, 4, 28, // 31–40 Obadiah–Matthew
  16, 24, 21, 28, 16, 16, 13, 6, 6, 4, // 41–50 Mark–Philippians
  4, 5, 3, 6, 4, 3, 1, 13, 5, 5, // 51–60 Colossians–1 Peter
  3, 5, 1, 1, 1, 22, // 61–66 2 Peter–Revelation
]

/** Total canonical chapters across all 66 books (1189). */
export const TOTAL_BIBLE_CHAPTERS = BOOK_CHAPTER_COUNTS.reduce((a, b) => a + b, 0)

/** Number of chapters in a book, or 0 for an out-of-range book number. */
export function chaptersInBook(bookNumber: number): number {
  return BOOK_CHAPTER_COUNTS[bookNumber] ?? 0
}

export type ChapterRef = { bookNumber: number; chapter: number }

/** Every canonical chapter as `{ bookNumber, chapter }`, book 1→66, chapter 1→N. */
export function allChapters(): ChapterRef[] {
  const out: ChapterRef[] = []
  for (let bookNumber = 1; bookNumber <= 66; bookNumber++) {
    const count = chaptersInBook(bookNumber)
    for (let chapter = 1; chapter <= count; chapter++) out.push({ bookNumber, chapter })
  }
  return out
}
