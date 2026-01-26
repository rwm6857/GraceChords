import type { Report } from './report.js'

export function renderReportHtml(report: Report & { title?: string }): string {
  const pretty = escapeHtml(JSON.stringify(report, null, 2))
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(report.title || 'Ingest Report')}</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; padding: 24px; background: #f7f5ef; color: #1c1b1a; }
    h1 { margin: 0 0 8px; }
    .meta { margin-bottom: 16px; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; background: #e7e1d6; font-weight: 600; }
    pre { background: #fff; padding: 16px; border-radius: 12px; border: 1px solid #e0d8cc; overflow: auto; }
    a { color: #1b4d7a; }
  </style>
</head>
<body>
  <h1>${escapeHtml(report.title || 'Ingest Report')}</h1>
  <div class="meta">
    <span class="badge">Score ${report.score} (${report.status})</span>
    <span style="margin-left:12px"><a href="preview.html">Open preview</a></span>
  </div>
  <pre>${pretty}</pre>
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
