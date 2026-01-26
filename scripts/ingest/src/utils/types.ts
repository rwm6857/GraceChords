export type WordBox = {
  text: string
  x: number
  y: number
  w: number
  h: number
  conf?: number
}

export type ExtractedLine = {
  text: string
  y?: number
  words?: WordBox[]
  source?: string
}

export type ExtractionResult = {
  lines: ExtractedLine[]
  warnings: string[]
  stats: {
    ocrConfidenceAvg?: number
  }
  extractor: string
  meta?: {
    title?: string
    authors?: string[]
    key?: string
    presentation?: string
    hasChords?: boolean
  }
}
