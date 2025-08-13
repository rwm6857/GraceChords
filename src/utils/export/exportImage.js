// JPG/PNG raster export from a shared plan.
/**
 * @param {ReturnType<import('./planSongRender').planSongRender>} plan
 * @returns {Promise<HTMLCanvasElement>} caller can toDataURL('image/jpeg')
 */
export async function renderCanvasFromPlan(plan) {
  const metrics = plan.page
  const canvas = document.createElement('canvas')
  const scale = plan.image.dpi / 72
  canvas.width = Math.round(metrics.width * scale)
  canvas.height = Math.round(metrics.height * scale)
  const ctx = canvas.getContext('2d')
  ctx.scale(scale, scale)
  ctx.fillStyle = plan.image.background || '#FFF'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.fillStyle = '#000'
  ctx.font = `${plan.typography.basePt}px ${plan.typography.sansFamily || 'sans-serif'}`

  const { width, height, margin } = metrics
  const colGap = 24
  const colWidth = (width - margin.l - margin.r - (plan.columns === 2 ? colGap : 0)) / (plan.columns === 2 ? 2 : 1)
  let x = margin.l
  let y = margin.t
  let col = 0
  const lineH = plan.typography.basePt * 1.35

  const commitColumnBreak = () => {
    if (plan.columns === 2 && col === 0) {
      col = 1
      x = margin.l + colWidth + colGap
      y = margin.t
      return true
    }
    // For raster export, we don’t paginate; let caller slice if needed
    return false
  }

  for (const block of plan.blocks) {
    const needed = (block.lines?.length || 2) * lineH + lineH
    if (y + needed > height - margin.b && !commitColumnBreak()) break
    if (block.kind === 'songHeader') {
      ctx.font = `bold ${plan.typography.basePt}px ${plan.typography.sansFamily || 'sans-serif'}`
      ctx.fillText(block.title, x, y)
      ctx.font = `${plan.typography.basePt}px ${plan.typography.sansFamily || 'sans-serif'}`
      y += lineH
      continue
    }
    ctx.font = `bold ${plan.typography.basePt}px ${plan.typography.sansFamily || 'sans-serif'}`
    ctx.fillText(`[${block.title}]`, x, y)
    ctx.font = `${plan.typography.basePt}px ${plan.typography.sansFamily || 'sans-serif'}`
    y += plan.typography.basePt * 1.2
    ;(block.lines || ['']).forEach((line) => {
      ctx.fillText(line, x, y)
      y += lineH
    })
    y += plan.typography.basePt * 0.6
  }

  return canvas
}

export default renderCanvasFromPlan
