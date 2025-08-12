// src/utils/image.js
import { planSongLayout } from './pdf'

// Load fonts for Canvas2D so measurements match PDF.
let fontsPromise = null
export async function ensureCanvasFonts() {
  if (fontsPromise) return fontsPromise
  const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '/')
  const specs = [
    { family: 'NotoSans', weight: '400', style: 'normal', file: 'NotoSans-Regular.ttf' },
    { family: 'NotoSans', weight: '700', style: 'normal', file: 'NotoSans-Bold.ttf' },
    { family: 'NotoSans', weight: '400', style: 'italic', file: 'NotoSans-Italic.ttf' },
    { family: 'NotoSans', weight: '700', style: 'italic', file: 'NotoSans-BoldItalic.ttf' },
    { family: 'NotoSansMono', weight: '400', style: 'normal', file: 'NotoSansMono-Regular.ttf' },
    { family: 'NotoSansMono', weight: '700', style: 'normal', file: 'NotoSansMono-Bold.ttf' }
  ]
  fontsPromise = Promise.all(specs.map(async (s) => {
    const face = new FontFace(s.family, `url(${base}fonts/${s.file})`, { weight: s.weight, style: s.style })
    const loaded = await face.load()
    document.fonts.add(loaded)
  })).then(() => ({ lyricFamily: 'NotoSans', chordFamily: 'NotoSansMono' }))
    .catch(() => ({ lyricFamily: 'Helvetica', chordFamily: 'Courier' }))
  return fontsPromise
}

// Render a planned layout to a Canvas2D
export function renderPlanToCanvas(plan, { pxWidth, pxHeight, dpi = 150 }) {
  const canvas = document.createElement('canvas')
  canvas.width = pxWidth
  canvas.height = pxHeight
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const scale = dpi / 72
  ctx.scale(scale, scale)
  const margin = plan.margin
  const headerTitlePt = Math.max(22, plan.lyricSizePt + 6)
  const headerKeyPt = Math.max(12, plan.lyricSizePt - 2)
  ctx.fillStyle = '#000'
  ctx.font = `bold ${headerTitlePt}px ${plan.lyricFamily}`
  ctx.fillText(plan.title, margin, margin + 24)
  ctx.font = `italic ${headerKeyPt}px ${plan.lyricFamily}`
  ctx.fillText(`Key: ${plan.key || '—'}`, margin, margin + 40)

  const lineGap = 4
  const sectionSize = plan.lyricSizePt
  const sectionTopPad = Math.round(plan.lyricSizePt * 0.85)
  const contentStartY = margin + plan.headerOffsetY

  const pages = plan.layout.pages || []
  const page = pages[0]
  page.columns.forEach((col) => {
    let x = col.x
    let y = contentStartY
    col.blocks.forEach((b) => {
      if (b.type === 'section') {
        y += sectionTopPad
        ctx.font = `bold ${sectionSize}px ${plan.lyricFamily}`
        ctx.fillText(`[${b.header}]`, x, y)
        y += sectionSize + 4
      } else if (b.type === 'line') {
        if (b.chords?.length) {
          ctx.font = `bold ${plan.chordSizePt}px ${plan.chordFamily}`
          b.chords.forEach(c => ctx.fillText(c.sym, x + c.x, y))
          y += plan.chordSizePt + lineGap / 2
        }
        ctx.font = `normal ${plan.lyricSizePt}px ${plan.lyricFamily}`
        ctx.fillText(b.lyrics, x, y)
        y += plan.lyricSizePt + lineGap
      }
    })
  })
  return canvas
}

// High-level helper to download a song as JPEG
export async function downloadSingleSongJpg(song, options = {}) {
  const dpi = options.dpi || 150
  const widthIn = options.widthInches || 8.5
  const heightIn = options.heightInches || 11
  const pxWidth = Math.round(widthIn * dpi)
  const pxHeight = Math.round(heightIn * dpi)
  const { lyricFamily, chordFamily } = await ensureCanvasFonts()
  const measureCtx = document.createElement('canvas').getContext('2d')
  const makeMeasureLyricAt = (pt) => (text) => {
    measureCtx.font = `${pt}px ${lyricFamily}`
    return measureCtx.measureText(text || '').width
  }
  const makeMeasureChordAt = (pt) => (text) => {
    measureCtx.font = `bold ${pt}px ${chordFamily}`
    return measureCtx.measureText(text || '').width
  }
  const plan = planSongLayout(song, { lyricFamily, chordFamily }, makeMeasureLyricAt, makeMeasureChordAt)
  if (plan.layout.pages.length > 1) {
    return { error: 'MULTI_PAGE', plan }
  }
  const canvas = renderPlanToCanvas(plan, { pxWidth, pxHeight, dpi })
  const link = document.createElement('a')
  const slug = (options.slug || song.slug || song.title || 'untitled').replace(/\s+/g, '_')
  link.href = canvas.toDataURL('image/jpeg', 0.92)
  link.download = `${slug}.jpg`
  link.click()
  return { plan }
}
