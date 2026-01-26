import { normalizeChordLine } from './chords.js'

export function renderPreviewHtml(chordpro: string): string {
  const lines = chordpro.split(/\r?\n/)
  const metadata: Record<string, string> = {}
  const bodyLines: string[] = []

  for (const line of lines) {
    const match = line.match(/^\{([^}:]+)\s*:\s*(.+)\}$/)
    if (match) {
      metadata[match[1].toLowerCase()] = match[2]
      continue
    }

    const directive = line.match(/^\{(soc|eoc|sov|eov|sob|eob|soi|eoi|soo|eoo|sot|eot)([^}]*)\}$/)
    if (directive) {
      const token = directive[1]
      if (token.startsWith('so')) {
        const label = directive[2]?.trim() || ''
        bodyLines.push(`\n## ${label || 'Section'}\n`)
      }
      continue
    }

    bodyLines.push(normalizeChordLine(line))
  }

  const metaEntries = Object.entries(metadata)
    .map(([key, value]) => `<div><strong>${escapeHtml(key)}:</strong> ${escapeHtml(value)}</div>`)
    .join('')

  const body = bodyLines
    .map((line) => `<div class="line">${escapeHtml(line)}</div>`)
    .join('')

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(metadata.title || 'ChordPro Preview')}</title>
  <style>
    body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; padding: 24px; background: #f7f5ef; color: #1c1b1a; }
    .meta { margin-bottom: 16px; font-family: system-ui, sans-serif; }
    .line { white-space: pre; font-size: 14px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="meta">${metaEntries}</div>
  <div class="body">${body}</div>
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
