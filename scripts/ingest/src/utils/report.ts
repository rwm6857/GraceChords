export type ExtractionStats = {
  lineCount: number
  chordLines: number
  lyricLines: number
  headingLines: number
  chordTokenRate: number
  mappingSuccessRate: number
  ocrConfidenceAvg?: number
  suspiciousInsertions: number
}

export type Report = {
  score: number
  status: 'ready' | 'needs_review' | 'likely_bad'
  warnings: string[]
  stats: ExtractionStats
  extractor: string
}

export function scoreExtraction(input: {
  stats: ExtractionStats
  warnings: string[]
  extractor: string
}): Report {
  const warnings = [...input.warnings]
  let score = 100

  const { chordTokenRate, mappingSuccessRate, ocrConfidenceAvg, suspiciousInsertions } = input.stats

  if (mappingSuccessRate < 0.6) {
    score -= 20
    warnings.push('Low chord-to-lyric alignment rate.')
  }

  if (chordTokenRate < 0.05) {
    score -= 15
    warnings.push('Very low chord token rate; check extraction quality.')
  }

  if (chordTokenRate > 0.85) {
    score -= 10
    warnings.push('Very high chord token rate; lyrics may be missing.')
  }

  if (typeof ocrConfidenceAvg === 'number' && ocrConfidenceAvg < 70) {
    score -= 20
    warnings.push('Low OCR confidence; review needed.')
  }

  if (suspiciousInsertions > 5) {
    score -= 10
    warnings.push('Many chord insertions fell mid-word.')
  }

  score = Math.max(0, Math.min(100, score))

  const status = score >= 80 ? 'ready' : score >= 50 ? 'needs_review' : 'likely_bad'

  return {
    score,
    status,
    warnings,
    stats: input.stats,
    extractor: input.extractor
  }
}
