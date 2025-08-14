import { ensureCanvasFonts } from '../fonts'

export async function exportImageFromPlan(plan, opts = {}) {
  const dpi = opts.dpi || 150
  const width = plan.page.width
  const height = plan.page.height
  const canvas = document.createElement('canvas')
  canvas.width = Math.round((width / 72) * dpi)
  canvas.height = Math.round((height / 72) * dpi)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const scale = dpi / 72
  ctx.scale(scale, scale)

  await ensureCanvasFonts()

  const { margin } = plan.page
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
      return true
    }
    return false
  }

  for (const block of plan.blocks) {
    const needed =
      block.kind === 'songHeader'
        ? lineH * 2
        : lineH * ((block.lines?.length || 1) + 2)
    if (y + needed > height - margin.b) {
      if (!nextColumnOrPage()) break
    }
    if (block.kind === 'songHeader') {
      ctx.font = `bold ${plan.typography.basePt * plan.typography.headerScale}px ${plan.typography.sans}`
      ctx.fillStyle = '#000'
      ctx.fillText(block.title, x, y)
      ctx.font = `${plan.typography.basePt}px ${plan.typography.sans}`
      y += lineH * 1.4
      continue
    }
    ctx.font = `bold ${plan.typography.basePt}px ${plan.typography.sans}`
    ctx.fillStyle = '#000'
    ctx.fillText(`[${block.title}]`, x, y)
    y += lineH * 0.9
    for (const line of block.lines || []) {
      if (y + lineH > height - margin.b) {
        if (!nextColumnOrPage()) break
      }
      ctx.font = `normal ${plan.typography.basePt}px ${
        line.chord ? plan.typography.mono : plan.typography.sans
      }`
      ctx.fillText(line.text, x, y)
      y += lineH
    }
    y += lineH * 0.4
  }

  const link = document.createElement('a')
  link.href = canvas.toDataURL('image/jpeg', 0.92)
  link.download = `${(opts.filename || 'Export').replace(/\s+/g, '_')}.jpg`
  link.click()
  return canvas
}
