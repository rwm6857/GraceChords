import type { Report } from './report.js'

export type BatchReportItem = {
  title: string
  stagingDir: string
  report: Report
}

export function renderBatchReportHtml(items: BatchReportItem[]): string {
  const total = items.length
  const ready = items.filter((item) => item.report.status === 'ready').length
  const needsReview = items.filter((item) => item.report.status === 'needs_review').length
  const likelyBad = items.filter((item) => item.report.status === 'likely_bad').length

  const summary = `<div class="summary">
    <div><strong>Total:</strong> ${total}</div>
    <div><strong>Ready:</strong> ${ready}</div>
    <div><strong>Needs review:</strong> ${needsReview}</div>
    <div><strong>Likely bad:</strong> ${likelyBad}</div>
  </div>`

  const sections = items
    .map((item) => {
      const warnings = item.report.warnings
      const warningList = warnings.length
        ? `<ul>${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>`
        : '<div class="meta">No warnings.</div>'

      const reportJson = escapeHtml(JSON.stringify(item.report, null, 2))
      const scoreClass =
        item.report.score >= 85 ? 'score-good' : item.report.score >= 70 ? 'score-warn' : item.report.score >= 50 ? 'score-mid' : 'score-bad'

      return `
      <details class="card ${item.report.status}">
        <summary>
          <span class="title">${escapeHtml(item.title)}</span>
          <span class="badge ${scoreClass}">Score ${item.report.score} (${item.report.status})</span>
        </summary>
        <div class="meta"><strong>Staging:</strong> ${escapeHtml(item.stagingDir)}</div>
        <div class="meta"><strong>Warnings:</strong></div>
        ${warningList}
        <div class="meta"><strong>Links:</strong>
          <a href="${escapeHtml(item.stagingDir)}/preview.html">Preview</a>
          <span class="divider">|</span>
          <a href="${escapeHtml(item.stagingDir)}/report.html">Report</a>
        </div>
        <pre>${reportJson}</pre>
      </details>`
    })
    .join('')

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>GraceChords Ingest Batch Report</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; padding: 24px; background: #f7f5ef; color: #1c1b1a; }
    h1 { margin: 0 0 12px; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; margin-bottom: 16px; }
    .card { background: #fff; border-radius: 12px; border: 1px solid #e0d8cc; padding: 12px 16px; margin-bottom: 12px; }
    summary { cursor: pointer; display: flex; justify-content: space-between; gap: 12px; font-weight: 600; }
    .badge { background: #eee6d9; padding: 4px 10px; border-radius: 999px; font-size: 12px; }
    .meta { margin: 8px 0; font-size: 13px; color: #4a453f; }
    .divider { margin: 0 6px; color: #8b8375; }
    ul { margin: 6px 0 12px 18px; padding: 0; }
    pre { white-space: pre-wrap; background: #fbfaf7; padding: 12px; border-radius: 8px; border: 1px solid #eee4d8; }
    .badge.score-good { background: #d7f1d6; }
    .badge.score-warn { background: #fff3c4; }
    .badge.score-mid { background: #ffe6cc; }
    .badge.score-bad { background: #ffd6d6; }
  </style>
</head>
<body>
  <h1>GraceChords Ingest Batch Report</h1>
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
