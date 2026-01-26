import type { CompareResult } from '../compare.js'

export function renderCompareReportHtml(
  results: CompareResult[],
  inputsDir: string,
  songsDir: string,
  options: {
    strictChords?: boolean
    compareChords?: boolean
    compareLyrics?: boolean
    compareSections?: boolean
    previousScores?: Map<string, number>
    previousAvgScore?: number | null
  } = {}
): string {
  const total = results.length
  const matched = results.filter((r) => r.status === 'matched').length
  const skipped = results.filter((r) => r.status === 'skipped').length
  const missingActual = results.filter((r) => r.status === 'missing_actual').length
  const chordMode = options.strictChords ? 'strict' : 'loose'
  const scopeParts = [
    options.compareChords ? 'chords' : '',
    options.compareLyrics ? 'lyrics' : '',
    options.compareSections ? 'sections' : ''
  ].filter(Boolean)
  const scope = scopeParts.length > 0 ? scopeParts.join(', ') : 'full'

  const currentAvg =
    matched > 0
      ? Math.round(
          results
            .filter((r) => typeof r.matchScore === 'number')
            .map((r) => r.matchScore as number)
            .reduce((a, b) => a + b, 0) / matched
        )
      : 0
  const avgDelta =
    typeof options.previousAvgScore === 'number' ? Math.round(currentAvg - options.previousAvgScore) : null
  const avgDeltaText =
    avgDelta === null ? '' : avgDelta > 0 ? `+${avgDelta}%` : avgDelta < 0 ? `${avgDelta}%` : '0%'
  const avgDeltaClass =
    avgDelta === null ? '' : avgDelta > 0 ? 'delta-pos' : avgDelta < 0 ? 'delta-neg' : 'delta-zero'

  const summary = `<div class="summary">
    <div><strong>Total:</strong> ${total}</div>
    <div><strong>Matched:</strong> ${matched}</div>
    <div><strong>Skipped:</strong> ${skipped}</div>
    <div><strong>Missing actual:</strong> ${missingActual}</div>
    <div><strong>Avg score:</strong> ${currentAvg}% ${avgDeltaText ? `<span class="delta ${avgDeltaClass}">${escapeHtml(avgDeltaText)}</span>` : ''}</div>
    <div><strong>Inputs:</strong> ${escapeHtml(inputsDir)}</div>
    <div><strong>Songs:</strong> ${escapeHtml(songsDir)}</div>
    <div><strong>Chord mode:</strong> ${escapeHtml(chordMode)}</div>
    <div><strong>Scope:</strong> ${escapeHtml(scope)}</div>
  </div>`

  const sections = results
    .map((result) => {
      const statusClass = result.status
      const score = typeof result.matchScore === 'number' ? result.matchScore : null
      const badge = score === null ? result.status : `${score}% match`
      const previousScore = options.previousScores?.get(result.slug)
      const delta =
        typeof score === 'number' && typeof previousScore === 'number' ? Math.round(score - previousScore) : null
      const deltaText =
        delta === null ? '' : delta > 0 ? `+${delta}%` : delta < 0 ? `${delta}%` : '0%'
      const deltaClass =
        delta === null ? '' : delta > 0 ? 'delta-pos' : delta < 0 ? 'delta-neg' : 'delta-zero'
      const scoreClass =
        score === null ? '' : score >= 85 ? 'score-good' : score >= 70 ? 'score-warn' : score >= 50 ? 'score-mid' : 'score-bad'
      const diff = result.diff ? escapeHtml(result.diff) : ''
      const meta = [
        result.expectedPath ? `<div><strong>Expected:</strong> ${escapeHtml(result.expectedPath)}</div>` : '',
        result.actualPath ? `<div><strong>Actual:</strong> ${escapeHtml(result.actualPath)}</div>` : '',
        typeof result.chordMismatchCount === 'number'
          ? `<div><strong>Chord mismatches:</strong> ${result.chordMismatchCount}</div>`
          : ''
      ].join('')

      const rows = diff
        ? (() => {
            const lines = diff.split('\n')
            const parsed: Array<{ left: string; right: string }> = []
            let index = 0
            while (index < lines.length) {
              const line = lines[index]
              const next = lines[index + 1]
              if (line.startsWith('- ') && next && next.startsWith('+ ')) {
                parsed.push({ left: line.slice(2), right: next.slice(2) })
                index += 2
                continue
              }
              if (line.startsWith('+ ') && next && next.startsWith('- ')) {
                parsed.push({ left: next.slice(2), right: line.slice(2) })
                index += 2
                continue
              }
              if (line.startsWith('- ')) {
                parsed.push({ left: line.slice(2), right: '' })
              } else if (line.startsWith('+ ')) {
                parsed.push({ left: '', right: line.slice(2) })
              } else if (line.startsWith('  ')) {
                parsed.push({ left: line.slice(2), right: line.slice(2) })
              } else {
                parsed.push({ left: line, right: '' })
              }
              index += 1
            }
            return parsed
          })()
        : []

      const table =
        rows.length > 0
          ? `<div class="diff-table">
              <div class="diff-head">Expected</div>
              <div class="diff-head">Actual</div>
              ${rows
                .map(
                  (row) => {
                    const mismatch = row.left !== row.right
                    const mismatchClass = mismatch ? ' diff-mismatch' : ''
                    return `
                <div class="diff-cell expected${mismatchClass}">${escapeHtml(row.left)}</div>
                <div class="diff-cell actual${mismatchClass}">${escapeHtml(row.right)}</div>`
                  }
                )
                .join('')}
            </div>`
          : '<div class="meta">No diff available.</div>'

      return `
      <details class="card ${statusClass}">
        <summary>
          <span class="title">${escapeHtml(result.title)} (${escapeHtml(result.slug)})</span>
          ${deltaText ? `<span class="delta ${deltaClass}">${escapeHtml(deltaText)}</span>` : ''}
          <span class="badge ${scoreClass}">${escapeHtml(badge)}</span>
        </summary>
        <div class="meta">${meta}</div>
        ${table}
      </details>`
    })
    .join('')

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>GraceChords Ingest Compare</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; padding: 24px; background: #f7f5ef; color: #1c1b1a; }
    h1 { margin: 0 0 12px; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px; margin-bottom: 16px; }
    .card { background: #fff; border-radius: 12px; border: 1px solid #e0d8cc; padding: 12px 16px; margin-bottom: 12px; }
    summary { cursor: pointer; display: flex; justify-content: space-between; gap: 12px; font-weight: 600; }
    .badge { background: #eee6d9; padding: 4px 10px; border-radius: 999px; font-size: 12px; }
    .meta { margin: 8px 0; font-size: 13px; color: #4a453f; }
    .diff-table { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; }
    .diff-head { font-weight: 600; font-size: 12px; text-transform: uppercase; color: #6b6357; padding: 4px 6px; }
    .diff-cell { background: #fbfaf7; padding: 6px 8px; border-radius: 6px; border: 1px solid #eee4d8; white-space: pre-wrap; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12px; }
    .diff-cell.diff-mismatch { background: #fff4e9; border-color: #f2d6c2; }
    .diff-cell.expected { border-left: 3px solid #c08f2a; }
    .matched .badge { background: #d7f1d6; }
    .skipped .badge { background: #ffe6cc; }
    .missing_actual .badge { background: #e0e0e0; }
    .diff-cell.actual { border-left: 3px solid #2a6dc0; }
    .badge.score-good { background: #d7f1d6; }
    .badge.score-warn { background: #fff3c4; }
    .badge.score-mid { background: #ffe6cc; }
    .badge.score-bad { background: #ffd6d6; }
    .delta { font-size: 12px; font-weight: 600; }
    .delta-pos { color: #2f7d32; }
    .delta-neg { color: #b71c1c; }
    .delta-zero { color: #6b6357; }
  </style>
</head>
<body>
  <h1>GraceChords Ingest Compare</h1>
  ${summary}
  ${sections}
</body>
</html>`
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
