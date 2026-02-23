// src/utils/media/image.js
import { chooseBestLayout, normalizeSongInput } from '../pdf/pdfLayout.js'
import { ensureCanvasFonts } from '../pdf/fonts.js'
import { formatInstrumental } from '../songs/instrumental.js'
import { resolveChordCollisions } from '../songs/chords.js'
export { ensureCanvasFonts } from '../pdf/fonts.js'

const PAGE_DEFAULT = { w: 612, h: 792 }
const MARGINS_DEFAULT = { top: 36, right: 36, bottom: 36, left: 36 }
const GUTTER_DEFAULT = 24
const TITLE_PT = 26
const SUBTITLE_PT = 16
const SIZE_WINDOW = [16, 15, 14, 13, 12]
const TITLE_LINE_FACTOR = 1.04
const SUBTITLE_LINE_FACTOR = 1
const LINE_HEIGHT_FACTOR = 1.2
const CHORD_ABOVE_GAP = 0.75
const SECTION_SPACER_PT = 8
const TITLE_TO_KEY_FACTOR = 0.85
const KEY_TO_SECTION_LINES = 1.125

function slugifyUnderscore(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^\w]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

function toPlannerSections(song) {
  const out = []
  const sections = Array.isArray(song?.sections) ? song.sections : []
  for (const sec of sections) {
    const lines = []
    for (const ln of sec?.lines || []) {
      lines.push({
        plain: String(ln?.plain ?? ln?.lyrics ?? ''),
        chords: (ln?.chordPositions ?? ln?.chords ?? []).map((c) => ({
          sym: String(c?.sym || ''),
          index: Math.max(0, c?.index | 0),
        })),
        comment: ln?.comment ? String(ln.comment) : '',
        instrumental: ln?.instrumental,
      })
    }
    out.push({
      label: String(sec?.label || sec?.kind || ''),
      lines,
    })
  }
  return out
}

function getMeasureCtx(createCanvas) {
  const measureCanvas = createCanvas
    ? createCanvas(1, 1)
    : (typeof document !== 'undefined' ? document.createElement('canvas') : null)
  if (!measureCanvas) throw new Error('Canvas unavailable. Provide createCanvas in options.')
  const measureCtx = measureCanvas.getContext('2d')
  if (!measureCtx || typeof measureCtx.measureText !== 'function') {
    throw new Error('Canvas 2D context unavailable for JPG planning.')
  }
  return measureCtx
}

function splitTextRowsByWidth(text = '', width = 0, measure = () => 0) {
  const source = String(text || '')
  if (!source.length) return [{ text: '', start: 0, end: 0 }]

  const rows = []
  const safeWidth = Math.max(1, width)
  let cursor = 0

  while (cursor < source.length) {
    while (cursor < source.length && source[cursor] === ' ') cursor += 1
    if (cursor >= source.length) break

    let lo = cursor + 1
    let hi = source.length
    let best = cursor + 1
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2)
      const chunk = source.slice(cursor, mid)
      if (measure(chunk) <= safeWidth || mid === cursor + 1) {
        best = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }

    let end = best
    if (end < source.length) {
      const space = source.lastIndexOf(' ', end - 1)
      if (space > cursor) end = space
    }

    let rowText = source.slice(cursor, end).replace(/\s+$/g, '')
    if (!rowText) {
      end = Math.min(source.length, cursor + 1)
      rowText = source.slice(cursor, end)
    }

    rows.push({ text: rowText, start: cursor, end })
    cursor = end
  }

  return rows.length ? rows : [{ text: '', start: 0, end: 0 }]
}

function splitLyricWithChordsRows(text = '', chords = [], width = 0, measureLyric = () => 0) {
  const rows = splitTextRowsByWidth(text, width, measureLyric)
  const normalizedChords = (chords || [])
    .map((c) => ({ sym: String(c?.sym || ''), index: Math.max(0, c?.index | 0) }))
    .sort((a, b) => a.index - b.index)

  return rows.map((row, i) => {
    const isLast = i === rows.length - 1
    const lineChords = normalizedChords.filter((c) => (
      c.index >= row.start && (c.index < row.end || (isLast && c.index === row.end))
    ))
    return { lyric: row.text, chords: lineChords, start: row.start, end: row.end }
  })
}

function headerHeightFor(title, key, measureLyric, contentWidth) {
  const titleRows = splitTextRowsByWidth(String(title || ''), contentWidth, measureLyric)
  const nTitle = Math.max(1, titleRows.length)
  const titleStack = TITLE_PT + (Math.max(0, nTitle - 1) * (TITLE_PT * TITLE_LINE_FACTOR))
  const gapTitleToKey = key ? TITLE_PT * TITLE_TO_KEY_FACTOR : 0
  const keyStack = key ? SUBTITLE_PT * SUBTITLE_LINE_FACTOR : 0
  return Math.ceil(titleStack + gapTitleToKey + keyStack)
}

function headerOffsetFor(title, key, bodyPt, measureLyric, contentWidth) {
  const headerH = headerHeightFor(title, key, measureLyric, contentWidth)
  return headerH + Math.ceil(bodyPt * LINE_HEIGHT_FACTOR * KEY_TO_SECTION_LINES)
}

function measureSectionHeight(section, width, bodyPt, columns, measureLyric) {
  let h = 0
  const lineH = bodyPt * LINE_HEIGHT_FACTOR

  if (section?.label) h += lineH

  for (const ln of section?.lines || []) {
    if (ln.instrumental) {
      const rows = formatInstrumental(ln.instrumental, { split: columns === 2 })
      h += Math.max(1, rows.length) * lineH
      continue
    }
    if (ln.comment) {
      h += lineH
      continue
    }

    const rows = splitLyricWithChordsRows(ln.plain || '', ln.chords || [], width, measureLyric)
    for (const row of rows) {
      if ((row.chords || []).length) h += lineH * CHORD_ABOVE_GAP
      h += lineH
    }
  }

  return h + SECTION_SPACER_PT
}

function canPackOnePage(sections, { columns, bodyPt, pageW, pageH, margin, gutter, title, key, measureLyric }) {
  const contentW = pageW - margin * 2
  const width = columns === 2 ? (contentW - gutter) / 2 : contentW
  const headerOffset = headerOffsetFor(title, key, bodyPt, measureLyric, contentW)
  const available = pageH - margin - margin - headerOffset
  if (available <= 0) return false

  const heights = sections.map((sec) => measureSectionHeight(sec, width, bodyPt, columns, measureLyric))

  if (columns === 1) {
    const total = heights.reduce((sum, n) => sum + n, 0)
    return total <= available
  }

  let left = available
  let right = available
  for (const h of heights) {
    if (h <= left) {
      left -= h
      continue
    }
    if (h <= right) {
      right -= h
      continue
    }
    return false
  }
  return true
}

function planOnePage(sections, { columns, bodyPt, pageW, pageH, margin, gutter, title, key, measureLyric }) {
  const contentW = pageW - margin * 2
  const width = columns === 2 ? (contentW - gutter) / 2 : contentW
  const headerOffset = headerOffsetFor(title, key, bodyPt, measureLyric, contentW)
  const available = pageH - margin - margin - headerOffset
  if (available <= 0) return null

  const plan = {
    columns,
    fontPt: bodyPt,
    lineH: bodyPt * LINE_HEIGHT_FACTOR,
    pages: [{ columns: columns === 2 ? [[], []] : [[]] }],
  }
  const pageCols = plan.pages[0].columns

  if (columns === 1) {
    let remaining = available
    for (let i = 0; i < sections.length; i += 1) {
      const h = measureSectionHeight(sections[i], width, bodyPt, columns, measureLyric)
      if (h > remaining) return null
      pageCols[0].push(i)
      remaining -= h
    }
    return plan
  }

  let remL = available
  let remR = available
  for (let i = 0; i < sections.length; i += 1) {
    const h = measureSectionHeight(sections[i], width, bodyPt, columns, measureLyric)
    if (h <= remL) {
      pageCols[0].push(i)
      remL -= h
      continue
    }
    if (h <= remR) {
      pageCols[1].push(i)
      remR -= h
      continue
    }
    return null
  }
  return plan
}

function planMultiPage(sections, { bodyPt, pageW, pageH, margin, title, key, measureLyric }) {
  const columns = 1
  const contentW = pageW - margin * 2
  const width = contentW
  const firstPageAvail = pageH - margin - margin - headerOffsetFor(title, key, bodyPt, measureLyric, contentW)
  const nextPageAvail = pageH - margin - margin
  const plan = { columns, fontPt: bodyPt, lineH: bodyPt * LINE_HEIGHT_FACTOR, pages: [{ columns: [[]] }] }

  let pageIdx = 0
  let remaining = firstPageAvail
  for (let i = 0; i < sections.length; i += 1) {
    const h = measureSectionHeight(sections[i], width, bodyPt, columns, measureLyric)
    if (h <= remaining) {
      plan.pages[pageIdx].columns[0].push(i)
      remaining -= h
      continue
    }
    pageIdx += 1
    plan.pages.push({ columns: [[]] })
    remaining = nextPageAvail
    plan.pages[pageIdx].columns[0].push(i)
    remaining -= h
  }

  return plan
}

function buildCanvasPlanFromPacked({
  song,
  sections,
  packed,
  pageW,
  margin,
  gutter,
  lyricFamily,
  chordFamily,
  makeMeasureLyricAt,
  makeMeasureChordAt,
}) {
  const title = String(song?.title || song?.meta?.title || 'Untitled')
  const key = String(song?.key || song?.meta?.key || '')
  const pt = packed.fontPt
  const columns = packed.columns
  const lineH = packed.lineH || (pt * LINE_HEIGHT_FACTOR)
  const contentW = pageW - margin * 2
  const colW = columns === 2 ? (contentW - gutter) / 2 : contentW
  const measureLyric = makeMeasureLyricAt(pt)
  const measureChord = makeMeasureChordAt(pt)
  const headerOffsetY = headerOffsetFor(title, key, pt, measureLyric, contentW)

  const pages = (packed.pages || []).map((page) => {
    const cols = []
    const pageColumns = Array.isArray(page?.columns) ? page.columns : [[]]
    for (let colIdx = 0; colIdx < columns; colIdx += 1) {
      const secIdxs = pageColumns[colIdx] || []
      const blocks = []

      for (const si of secIdxs) {
        const sec = sections[si]
        if (!sec) continue
        if (sec.label) blocks.push({ type: 'section', header: sec.label })

        for (const ln of sec.lines || []) {
          if (ln.instrumental) {
            blocks.push({
              type: 'instrumental',
              instrumental: {
                chords: Array.isArray(ln.instrumental?.chords) ? ln.instrumental.chords.slice() : [],
                repeat: typeof ln.instrumental?.repeat === 'number' ? ln.instrumental.repeat : undefined,
              },
            })
            continue
          }
          if (ln.comment) {
            blocks.push({ type: 'line', comment: ln.comment })
            continue
          }

          const rows = splitLyricWithChordsRows(ln.plain || '', ln.chords || [], colW, measureLyric)
          for (const row of rows) {
            const chords = (row.chords || []).map((c) => {
              const offset = Math.min(Math.max(0, c.index - (row.start || 0)), row.lyric.length)
              const x = measureLyric(row.lyric.slice(0, offset))
              const w = measureChord(c.sym || '')
              return { sym: c.sym, x, w }
            })
            resolveChordCollisions(chords)
            blocks.push({ type: 'line', lyrics: row.lyric, chords })
          }
        }

        blocks.push({ type: 'spacer', height: SECTION_SPACER_PT })
      }

      cols.push({
        x: margin + (colIdx * (colW + gutter)),
        blocks,
      })
    }
    return { columns: cols }
  })

  return {
    engine: 'pdf_mvp_like',
    lyricFamily,
    chordFamily,
    lyricSizePt: pt,
    chordSizePt: pt,
    columns,
    lineH,
    margin,
    headerOffsetY,
    gutter,
    layout: { pages },
    title,
    key,
  }
}

export function planSongForJpg(songIn, options = {}) {
  const song = normalizeSongInput(songIn)
  const lyricFamily = options.lyricFamily || options.fonts?.lyricFamily || 'Helvetica'
  const chordFamily = options.chordFamily || options.fonts?.chordFamily || 'Courier'
  const pageW = Number(options.pageWidthPt) > 0 ? Number(options.pageWidthPt) : PAGE_DEFAULT.w
  const pageH = Number(options.pageHeightPt) > 0 ? Number(options.pageHeightPt) : PAGE_DEFAULT.h
  const margin = Number(options.marginPt) >= 0 ? Number(options.marginPt) : MARGINS_DEFAULT.left
  const gutter = Number(options.gutterPt) >= 0 ? Number(options.gutterPt) : GUTTER_DEFAULT
  const sections = toPlannerSections(song)
  const title = String(song?.title || song?.meta?.title || 'Untitled')
  const key = String(song?.key || song?.meta?.key || '')
  const measureCtx = getMeasureCtx(options.createCanvas)
  const makeMeasureLyricAt = (pt) => (text) => {
    measureCtx.font = `${pt}px ${lyricFamily}`
    return measureCtx.measureText(text || '').width
  }
  const makeMeasureChordAt = (pt) => (text) => {
    measureCtx.font = `bold ${pt}px ${chordFamily}`
    return measureCtx.measureText(text || '').width
  }

  let packed = null
  for (const pt of SIZE_WINDOW) {
    const measureLyric = makeMeasureLyricAt(pt)
    if (canPackOnePage(sections, { columns: 1, bodyPt: pt, pageW, pageH, margin, gutter, title, key, measureLyric })) {
      packed = planOnePage(sections, { columns: 1, bodyPt: pt, pageW, pageH, margin, gutter, title, key, measureLyric })
      break
    }
  }
  if (!packed) {
    for (const pt of SIZE_WINDOW) {
      const measureLyric = makeMeasureLyricAt(pt)
      if (canPackOnePage(sections, { columns: 2, bodyPt: pt, pageW, pageH, margin, gutter, title, key, measureLyric })) {
        packed = planOnePage(sections, { columns: 2, bodyPt: pt, pageW, pageH, margin, gutter, title, key, measureLyric })
        break
      }
    }
  }
  if (!packed) {
    const pt = 15
    packed = planMultiPage(sections, { bodyPt: pt, pageW, pageH, margin, title, key, measureLyric: makeMeasureLyricAt(pt) })
  }

  const plan = buildCanvasPlanFromPacked({
    song,
    sections,
    packed,
    pageW,
    margin,
    gutter,
    lyricFamily,
    chordFamily,
    makeMeasureLyricAt,
    makeMeasureChordAt,
  })
  const summary = {
    pages: packed?.pages?.length || 0,
    columns: packed?.columns || 1,
    size: packed?.fontPt || 12,
  }

  if (summary.pages > 1) {
    return { error: 'MULTI_PAGE', plan, summary }
  }
  return { plan, summary }
}

// Render a planned layout to a Canvas2D
export function renderPlanToCanvas(plan, { pxWidth, pxHeight, dpi = 150, createCanvas } = {}) {
  const canvas = createCanvas
    ? createCanvas(pxWidth, pxHeight)
    : (typeof document !== 'undefined' ? document.createElement('canvas') : null)
  if (!canvas) throw new Error('Canvas unavailable. Provide createCanvas in options.')
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
  ctx.fillText(String(plan.title || 'Untitled'), margin, margin + 24)
  ctx.font = `italic ${headerKeyPt}px ${plan.lyricFamily}`
  const keyStr = String(plan.key || '—')
  ctx.fillText(`Key of ${keyStr}`, margin, margin + 40)

  const lineGap = 4
  const sectionSize = plan.lyricSizePt
  const sectionTopPad = Math.round(plan.lyricSizePt * 0.85)
  const contentStartY = margin + (plan.headerOffsetY || (headerTitlePt * 1.05 + headerKeyPt * 1.05 + 12))

  const pages = plan.layout.pages || []
  const page = pages[0]
  if (plan?.engine === 'pdf_mvp_like') {
    const lineH = plan.lineH || (plan.lyricSizePt * LINE_HEIGHT_FACTOR)
    const contentStartY = margin + (plan.headerOffsetY || 0)
    page.columns.forEach((col) => {
      const x = col.x
      let y = contentStartY
      col.blocks.forEach((b) => {
        if (b.type === 'section') {
          if (b.header) {
            ctx.font = `bold ${plan.lyricSizePt}px ${plan.lyricFamily}`
            ctx.fillStyle = '#000'
            ctx.fillText(`[${String(b.header).toUpperCase()}]`, x, y)
            y += lineH
          }
          return
        }
        if (b.type === 'spacer') {
          y += typeof b.height === 'number' ? b.height : SECTION_SPACER_PT
          return
        }
        if (b.type === 'instrumental') {
          const rows = formatInstrumental(b.instrumental || {}, { split: plan.columns === 2 })
          if (rows.length) {
            ctx.font = `bold ${plan.chordSizePt}px ${plan.chordFamily}`
            ctx.fillStyle = '#000'
            rows.forEach((row) => {
              ctx.fillText(row, x, y)
              y += lineH
            })
          }
          return
        }
        if (b.type === 'line') {
          if (b.comment) {
            ctx.font = `italic ${plan.lyricSizePt}px ${plan.lyricFamily}`
            const prev = ctx.fillStyle
            ctx.fillStyle = '#6b7280'
            ctx.fillText(b.comment, x, y)
            ctx.fillStyle = prev
            y += lineH
            return
          }
          if (b.chords?.length) {
            ctx.font = `bold ${plan.chordSizePt}px ${plan.chordFamily}`
            b.chords.forEach((c) => ctx.fillText(c.sym, x + c.x, y))
            y += lineH * CHORD_ABOVE_GAP
          }
          ctx.font = `normal ${plan.lyricSizePt}px ${plan.lyricFamily}`
          ctx.fillStyle = '#000'
          ctx.fillText(b.lyrics || '', x, y)
          y += lineH
        }
      })
    })
    return canvas
  }

  page.columns.forEach((col) => {
    let x = col.x
    let y = contentStartY
    col.blocks.forEach((b) => {
      if (b.type === 'section') {
        y += sectionTopPad
        ctx.font = `bold ${sectionSize}px ${plan.lyricFamily}`
        ctx.fillText(`[${b.header}]`, x, y)
        y += sectionSize + 4
      } else if (b.type === 'instrumental') {
        const rows = formatInstrumental(b.instrumental || {}, { split: plan.columns === 2 })
        if (rows.length) {
          ctx.font = `bold ${plan.chordSizePt}px ${plan.chordFamily}`
          ctx.fillStyle = '#000'
          rows.forEach((row) => {
            ctx.fillText(row, x, y)
            y += plan.lyricSizePt + lineGap
          })
        }
      } else if (b.type === 'line') {
        if (b.comment) {
          ctx.font = `italic ${plan.lyricSizePt}px ${plan.lyricFamily}`
          const prev = ctx.fillStyle
          ctx.fillStyle = '#6b7280'
          ctx.fillText(b.comment, x, y)
          ctx.fillStyle = prev
          y += plan.lyricSizePt + lineGap
          return
        }
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

/**
 * High-level helper to prepare a song as JPEG.
 * Returns the computed layout plan plus a Blob/filename for download or sharing.
 * Song objects should already include `sections` or be processed via
 * normalizeSongInput before calling this helper.
 */
export async function downloadSingleSongJpg(song, options = {}) {
  const dpi = options.dpi || 150
  const widthIn = options.widthInches || 8.5
  const heightIn = options.heightInches || 11
  const createCanvas = options.createCanvas
  const providedFonts = options.fonts
  const quality = typeof options.quality === 'number' ? options.quality : 0.92
  const pxWidth = Math.round(widthIn * dpi)
  const pxHeight = Math.round(heightIn * dpi)
  const fonts = providedFonts || await ensureCanvasFonts()
  const { lyricFamily, chordFamily } = fonts
  let plan = options.plan
  if (!plan) {
    try {
      const planned = planSongForJpg(song, {
        createCanvas,
        fonts,
        lyricFamily,
        chordFamily,
        pageWidthPt: Math.round(widthIn * 72),
        pageHeightPt: Math.round(heightIn * 72),
      })
      plan = planned.plan
      if (planned.error === 'MULTI_PAGE') {
        return { error: 'MULTI_PAGE', plan }
      }
    } catch {
      const measureCanvas = createCanvas
        ? createCanvas(1, 1)
        : (typeof document !== 'undefined' ? document.createElement('canvas') : null)
      if (!measureCanvas) throw new Error('Canvas unavailable. Provide createCanvas in options.')
      const measureCtx = measureCanvas.getContext('2d')
      const makeMeasureLyricAt = (pt) => (text) => {
        measureCtx.font = `${pt}px ${lyricFamily}`
        return measureCtx.measureText(text || '').width
      }
      const makeMeasureChordAt = (pt) => (text) => {
        measureCtx.font = `bold ${pt}px ${chordFamily}`
        return measureCtx.measureText(text || '').width
      }
      const res = chooseBestLayout(song, { lyricFamily, chordFamily }, makeMeasureLyricAt, makeMeasureChordAt)
      plan = res.plan
    }
  }
  if (plan.layout.pages.length > 1) {
    return { error: 'MULTI_PAGE', plan }
  }
  const canvas = renderPlanToCanvas(plan, { pxWidth, pxHeight, dpi, createCanvas })
  const slug = slugifyUnderscore(String(options.slug || song.slug || song.title || 'untitled'))
  const filename = `${slug}.jpg`
  const blob = await new Promise((resolve, reject) => {
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b)
          else reject(new Error('Failed to generate JPG blob'))
        },
        'image/jpeg',
        quality
      )
      return
    }
    if (typeof canvas.toBuffer === 'function') {
      try {
        const buf = canvas.toBuffer('image/jpeg', { quality })
        resolve(new Blob([buf], { type: 'image/jpeg' }))
      } catch (err) {
        reject(err)
      }
      return
    } else {
      try {
        const dataUrl = canvas.toDataURL('image/jpeg', quality)
        const parts = dataUrl.split(',')
        const mimeMatch = parts[0]?.match(/:(.*?);/)
        const binary = atob(parts[1] || '')
        const length = binary.length
        const u8 = new Uint8Array(length)
        for (let i = 0; i < length; i += 1) {
          u8[i] = binary.charCodeAt(i)
        }
        resolve(new Blob([u8], { type: mimeMatch?.[1] || 'image/jpeg' }))
      } catch (err) {
        reject(err)
      }
    }
  })
  return { plan, blob, filename }
}
