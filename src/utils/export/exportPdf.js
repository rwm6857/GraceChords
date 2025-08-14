import { jsPDF } from 'jspdf'
import { ensureFontsEmbedded } from '../fonts'

function ensureFonts(doc, plan) {
  const families = doc.getFontList ? Object.keys(doc.getFontList()) : []
  if (!families.some((f) => f.toLowerCase().includes('noto'))) {
    throw new Error('Noto fonts not registered for PDF export')
  }
}

export async function exportPdfFromPlan(plan) {
  const isA4 = plan.page.size === 'A4'
  const doc = new jsPDF({ unit: 'pt', format: isA4 ? 'a4' : 'letter' })
  doc.setProperties({ title: plan.docTitle })

  await ensureFontsEmbedded(doc)
  ensureFonts(doc, plan)
  doc.setFont(plan.typography.sans, 'normal')
  doc.setFontSize(plan.typography.basePt)

  const { width, height, margin } = plan.page
  const gap = 24
  const twoCol = plan.columns === 2
  const colWidth =
    (width - margin.l - margin.r - (twoCol ? gap : 0)) / (twoCol ? 2 : 1)

  let x = margin.l,
    y = margin.t,
    col = 0
  const lineH = plan.typography.basePt * 1.35

  const nextColumnOrPage = () => {
    if (twoCol && col === 0) {
      col = 1
      x = margin.l + colWidth + gap
      y = margin.t
      return
    }
    doc.addPage()
    x = margin.l
    y = margin.t
    col = 0
  }

  for (const block of plan.blocks) {
    const needed =
      block.kind === 'songHeader'
        ? lineH * 2
        : lineH * ((block.lines?.length || 1) + 2)
    if (y + needed > height - margin.b) nextColumnOrPage()

    if (block.kind === 'songHeader') {
      doc.setFont(plan.typography.sans, 'bold')
      doc.setFontSize(plan.typography.basePt * plan.typography.headerScale)
      doc.text(block.title, x, y)
      doc.setFont(plan.typography.sans, 'normal')
      doc.setFontSize(plan.typography.basePt)
      y += lineH * 1.4
      continue
    }

    doc.setFont(plan.typography.sans, 'bold')
    doc.text(`[${block.title}]`, x, y)
    doc.setFont(plan.typography.sans, 'normal')
    y += lineH * 0.9

    for (const line of block.lines || []) {
      if (y + lineH > height - margin.b) nextColumnOrPage()
      if (line.chord) doc.setFont(plan.typography.mono, 'normal')
      else doc.setFont(plan.typography.sans, 'normal')
      doc.text(line.text, x, y)
      y += lineH
    }
    y += lineH * 0.4
  }

  return doc
}
