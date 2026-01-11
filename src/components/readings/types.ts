export type VerseRange = {
  start: number
  end: number | null
}

export type Passage = {
  book: string
  chapter: number
  range: VerseRange | null
}

export type PlanEntry = {
  mmdd: string
  readings: string[]
}
