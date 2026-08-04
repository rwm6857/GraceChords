// Fixture builder for the PDF importer's input contract.
//
// Chord sheets are written here as ASCII art and turned into the positioned-text
// shape `buildSongDraft` consumes, with x derived from the character column. That
// is exactly the geometry a monospaced chart produces, so a chord written above a
// letter in the fixture really does sit above it in the coordinates — which is the
// only way these tests exercise the alignment path rather than a mock of it.

/** Character advance, points. */
export const CW = 6
/** Baseline-to-baseline pitch, points. */
export const LEADING = 14
const FONT_SIZE = 10

/**
 * @param {(string | { text: string, dy?: number, fontSize?: number, isBold?: boolean })[]} rows
 *   `''` is a blank line: it consumes a vertical slot without emitting a line, so
 *   the next line's pitch doubles, which is what the gap inference reads. `dy` sets
 *   the pitch from that row to the one after it — use it for a tight chord/lyric pair.
 * @param {{ page?: number, column?: number | null, x0?: number, y0?: number, charX?: boolean }} opts
 */
export function lines(rows, opts = {}) {
  const { page = 0, column = null, x0 = 0, y0 = 0, charX = true } = opts
  const slots = []
  let y = y0
  for (const row of rows) {
    const spec = typeof row === 'string' ? { text: row } : row
    if (spec.text.trim()) slots.push({ spec, y })
    y += spec.dy ?? LEADING
  }

  const out = []
  let first = true
  for (const { spec, y: lineY } of slots) {
    const words = []
    const re = /\S+/g
    let match
    while ((match = re.exec(spec.text)) !== null) {
      const x = x0 + match.index * CW
      const word = {
        text: match[0],
        x,
        y: lineY,
        w: match[0].length * CW,
        h: FONT_SIZE,
        start: match.index,
        end: match.index + match[0].length,
      }
      if (charX) word.charX = Array.from({ length: match[0].length }, (_, k) => x + k * CW)
      words.push(word)
    }

    const left = Math.min(...words.map((w) => w.x))
    const right = Math.max(...words.map((w) => w.x + w.w))
    out.push({
      text: spec.text.replace(/\s+$/, ''),
      words,
      x: left,
      y: lineY,
      w: right - left,
      h: FONT_SIZE,
      fontSize: spec.fontSize ?? FONT_SIZE,
      isBold: spec.isBold ?? false,
      page,
      column,
      startsBlock: first,
    })
    first = false
  }

  return out
}

export function page(index, overrides = {}) {
  return { index, width: 612, height: 792, columnCount: 1, layoutTrusted: true, ...overrides }
}

/** One single-column page from ASCII rows. */
export function doc(rows, opts = {}) {
  return { lines: lines(rows, opts), pages: [page(0, opts.page ?? {})], diagnostics: opts.diagnostics ?? [] }
}

/** Compose several line groups (columns, pages) into one document in reading order. */
export function compose(groups, pages, diagnostics = []) {
  return { lines: groups.flat(), pages, diagnostics }
}
