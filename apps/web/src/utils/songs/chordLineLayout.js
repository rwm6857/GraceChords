import { resolveChordCollisions } from './chords'

export function splitTextRowsByWidth(text = '', width = 0, measure = () => 0) {
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

export function buildChordRowsLayout({
  plain = '',
  chords = [],
  width = 0,
  measureLyric = () => 0,
  measureChord = () => 0,
  transposeSym = (sym) => sym,
  spaceWidth = 0,
}) {
  const rows = splitTextRowsByWidth(plain, width, measureLyric)
  const normalizedChords = (chords || [])
    .map((c) => ({
      index: Math.max(0, Number(c?.index) || 0),
      sym: String(c?.sym || ''),
    }))
    .sort((a, b) => a.index - b.index)

  const safeRowWidth = Math.max(0, width)

  return rows.map((row, i) => {
    const isLast = i === rows.length - 1
    const lineChords = normalizedChords.filter((c) => (
      c.index >= row.start && (c.index < row.end || (isLast && c.index === row.end))
    ))

    const measured = lineChords.map((c) => {
      const localIndex = Math.max(0, Math.min(row.text.length, c.index - row.start))
      const sym = transposeSym(c.sym)
      return {
        sym,
        x: measureLyric(row.text.slice(0, localIndex)),
        w: measureChord(sym),
      }
    })

    resolveChordCollisions(measured, spaceWidth)
    measured.sort((a, b) => a.x - b.x)
    for (let j = 1; j < measured.length - 1; j += 1) {
      const left = measured[j - 1]
      const mid = measured[j]
      const right = measured[j + 1]
      const gapLeft = mid.x - (left.x + left.w)
      const gapRight = right.x - (mid.x + mid.w)
      if (gapLeft < spaceWidth && gapRight < spaceWidth) {
        left.x = Math.min(left.x, mid.x - spaceWidth - left.w)
        right.x = Math.max(right.x, mid.x + mid.w + spaceWidth)
      }
    }

    return {
      text: row.text,
      offsets: measured.map((m) => ({
        sym: m.sym,
        left: safeRowWidth > 0
          ? Math.min(Math.max(0, m.x), Math.max(0, safeRowWidth - m.w - 2))
          : Math.max(0, m.x),
      })),
    }
  })
}
