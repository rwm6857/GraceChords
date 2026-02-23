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
