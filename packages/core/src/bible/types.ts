// Shared Bible/reading domain types (DOM-free). Mirrors the shapes proven in
// apps/web/src/features/readings + apps/web/src/utils/bible; the mobile Reader
// consumes these from @gracechords/core.

export type VerseRange = {
  start: number
  end: number | null
}

export type Passage = {
  bookNumber: number
  book: string
  chapter: number
  range: VerseRange | null
}

export type PlanReading = {
  book: number
  ref: string
}

export type PlanEntry = {
  mmdd: string
  readings: PlanReading[]
}

export type BibleTranslation = {
  id: string
  label: string
  name: string
  language: string
  /** R2 prefix for this translation's chapter files, e.g. `bible/en/esv`. */
  dataRoot: string
}

export type ChapterData = {
  book: string
  chapter: number
  verses: Record<string, string>
}
