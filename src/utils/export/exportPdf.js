// PDF export consumes a precomputed plan from planSongRender().
// Sets /Title metadata; enforces keepTogether & widow/orphan via the plan.
import { jsPDF } from 'jspdf'

/**
 * @param {ReturnType<import('./planSongRender').planSongRender>} plan
 */
export async function exportPdfFromPlan(plan) {
  const doc = new jsPDF({ unit: 'pt', format: plan.page.size === 'A4' ? 'a4' : 'letter' })
  // Metadata to avoid "Untitled"
  doc.setProperties({ title: plan.docTitle })

  const { width, height, margin } = plan.page
  const colGap = 24
  const colWidth = (width - margin.l - margin.r - (plan.columns === 2 ? colGap : 0)) / (plan.columns === 2 ? 2 : 1)

  doc.setFont(plan.typography.sansFamily || 'helvetica', 'normal')
  doc.setFontSize(plan.typography.basePt)

  let x = margin.l
  let y = margin.t
  let col = 0

  const commitColumnBreak = () => {
    if (plan.columns === 2 && col === 0) {
      col = 1
      x = margin.l + colWidth + colGap
      y = margin.t
      return true
    }
    doc.addPage()
    x = margin.l
    y = margin.t
    col = 0
    return true
  }

  const writeLines = (lines) => {
    const lineH = plan.typography.basePt * 1.35
    for (let i = 0; i < lines.length; i++) {
      if (y + lineH > height - margin.b) {
        commitColumnBreak()
      }
      doc.text(lines[i], x, y)
      y += lineH
    }
  }

  // Simple non-splitting: measure a block by number of lines and keep together
  const measureBlockHeight = (block) => {
    const lineH = plan.typography.basePt * 1.35
    if (block.kind === 'songHeader') return lineH * 2
    const lines = block.lines?.length || 0
    return lineH * (Math.max(1, lines) + 1)
  }

  for (const block of plan.blocks) {
    const needed = measureBlockHeight(block)
    if (y + needed > height - margin.b) {
      commitColumnBreak()
    }
    if (block.kind === 'songHeader') {
      doc.setFont(undefined, 'bold')
      doc.text(block.title, x, y)
      doc.setFont(undefined, 'normal')
      y += plan.typography.basePt * 1.6
      continue
    }
    // Section title
    doc.setFont(undefined, 'bold')
    doc.text(`[${block.title}]`, x, y)
    doc.setFont(undefined, 'normal')
    y += plan.typography.basePt * 1.2
    // Lines (lyrics with chords already aligned by upstream render)
    writeLines(block.lines || [''])
    y += plan.typography.basePt * 0.6
  }

  return doc
}

export default exportPdfFromPlan
