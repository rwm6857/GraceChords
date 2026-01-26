import type { CompareResult } from '../compare.js'

export function buildCompareSummary(results: CompareResult[]) {
  const matched = results.filter((r) => r.status === 'matched')
  const scores = matched.map((r) => r.matchScore || 0)
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0

  const totals = {
    chordPlacement: 0,
    chordQuality: 0,
    sectionOrder: 0,
    lyricText: 0
  }

  matched.forEach((result) => {
    if (result.mismatchCounts) {
      totals.chordPlacement += result.mismatchCounts.chordPlacement
      totals.chordQuality += result.mismatchCounts.chordQuality
      totals.sectionOrder += result.mismatchCounts.sectionOrder
      totals.lyricText += result.mismatchCounts.lyricText
    }
  })

  return {
    songs: results.length,
    matched: matched.length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    missingActual: results.filter((r) => r.status === 'missing_actual').length,
    avgScore,
    mismatchTotals: totals
  }
}

export function buildCompareMarkdown(
  results: CompareResult[],
  inputsDir: string,
  songsDir: string,
  options: {
    strictChords?: boolean
    chords?: boolean
    lyrics?: boolean
    sections?: boolean
  }
) {
  const summary = buildCompareSummary(results)
  const scope = [options.chords ? 'chords' : '', options.lyrics ? 'lyrics' : '', options.sections ? 'sections' : '']
    .filter(Boolean)
    .join(', ')
  const scopeLabel = scope.length > 0 ? scope : 'full'

  const topSamples = results
    .filter((r) => r.mismatchSamples && r.mismatchSamples.length > 0)
    .flatMap((r) => r.mismatchSamples || [])
    .slice(0, 10)

  const sampleLines = topSamples
    .map((sample) => `- ${sample.type}\n  expected: ${sample.expected}\n  actual:   ${sample.actual}`)
    .join('\n')

  return `# Compare Summary

- Inputs: ${inputsDir}
- Songs: ${songsDir}
- Scope: ${scopeLabel}
- Strict chords: ${options.strictChords ? 'yes' : 'no'}
- Avg score: ${summary.avgScore}
- Songs: ${summary.songs} (matched ${summary.matched}, skipped ${summary.skipped}, missing actual ${summary.missingActual})

Mismatch totals:
- chordPlacement: ${summary.mismatchTotals.chordPlacement}
- chordQuality: ${summary.mismatchTotals.chordQuality}
- sectionOrder: ${summary.mismatchTotals.sectionOrder}
- lyricText: ${summary.mismatchTotals.lyricText}

Top mismatch examples:
${sampleLines || '- None'}
`
}
