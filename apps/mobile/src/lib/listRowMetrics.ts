// Exact vertical metrics for `ListRow` / `SectionHeader`, and the flat cell
// table a `SectionList` needs for `getItemLayout`.
//
// Why this exists: `SectionList.scrollToLocation` (the A–Z scrubber's jump)
// cannot reach a section outside the render window unless the list can compute
// that section's offset without measuring it. Without `getItemLayout` RN falls
// back to `onScrollToIndexFailed`, whose `averageItemLength` is unreliable
// (0 before any cell has been measured on the New Architecture) — the list then
// scrolls to y=0 and the scrub lands at the top instead of the letter.
//
// Making the offsets exact means the row heights here must match what the
// components actually lay out. `ListRow` and `SectionHeader` therefore pin
// their text line heights to the constants below instead of relying on the
// platform font's natural line height, so the formulas can't silently drift.

/**
 * Explicit `lineHeight` values for the text inside a `ListRow` / `SectionHeader`.
 * Chosen to sit on top of the natural iOS/Android line heights for the matching
 * token font sizes, so pinning them is visually a no-op.
 */
export const LINE_HEIGHTS = {
  /** typography.rowTitle — 16.5pt */
  rowTitle: 20,
  /** typography.rowSubtitle — 13.5pt */
  rowSubtitle: 16,
  /** typography.rowKey — 14pt */
  rowKey: 17,
  /** typography.rowMeta — 12.5pt */
  rowMeta: 15,
  /** typography.sectionHeader — 13pt */
  sectionHeader: 16,
} as const

/** Layout constants baked into `ListRow`'s stylesheet. */
const ROW_PADDING_VERTICAL = 11
const ROW_HAIRLINE = 0.5
/** `marginTop` on the subtitle and on the trailing meta line. */
const STACK_GAP = 2

/** Layout constants baked into `SectionHeader`'s stylesheet. */
const HEADER_PADDING_TOP = 7
const HEADER_PADDING_BOTTOM = 4

/** Which optional slots a library `ListRow` renders — each adds a text line. */
export type RowSlots = {
  /** A non-empty `subtitle` (the artist, or the grid's blank spacer line). */
  subtitle: boolean
  /** `trailingTop` — the song's key. */
  key: boolean
  /** `trailingBottom` — the time signature. */
  meta: boolean
}

/**
 * Height of one `ListRow` in points. `fontScale` is the OS text-size
 * multiplier (`useWindowDimensions().fontScale`) — it scales text but not the
 * paddings/margins around it, which is exactly how RN lays the row out.
 */
export function listRowHeight(slots: RowSlots, fontScale = 1): number {
  const leading =
    LINE_HEIGHTS.rowTitle * fontScale +
    (slots.subtitle ? STACK_GAP + LINE_HEIGHTS.rowSubtitle * fontScale : 0)
  const trailing =
    (slots.key ? LINE_HEIGHTS.rowKey * fontScale : 0) +
    (slots.meta ? (slots.key ? STACK_GAP : 0) + LINE_HEIGHTS.rowMeta * fontScale : 0)
  return ROW_PADDING_VERTICAL * 2 + ROW_HAIRLINE + Math.max(leading, trailing)
}

/** Height of one `SectionHeader` in points. */
export function sectionHeaderHeight(fontScale = 1): number {
  return HEADER_PADDING_TOP + HEADER_PADDING_BOTTOM + LINE_HEIGHTS.sectionHeader * fontScale
}

export type CellLayout = { length: number; offset: number; index: number }

/**
 * Flat cell table for a `SectionList`, in the order `VirtualizedSectionList`
 * flattens its sections: `[header, ...data, footer]` per section — the footer
 * cell exists even with no `renderSectionFooter` (it renders nothing, so it is
 * zero-height), which is why each section consumes `data.length + 2` indices.
 *
 * Assumes no item/section separator components; add them here if the list ever
 * grows any.
 */
export function buildSectionListLayout<S extends { data: readonly unknown[] }>(
  sections: readonly S[],
  measure: {
    header: (section: S, sectionIndex: number) => number
    item: (item: unknown, sectionIndex: number, itemIndex: number) => number
  },
): CellLayout[] {
  const cells: CellLayout[] = []
  let offset = 0
  const push = (length: number) => {
    cells.push({ length, offset, index: cells.length })
    offset += length
  }
  sections.forEach((section, sectionIndex) => {
    push(measure.header(section, sectionIndex))
    section.data.forEach((item, itemIndex) => push(measure.item(item, sectionIndex, itemIndex)))
    push(0) // section footer
  })
  return cells
}

/** `getItemLayout` reader that tolerates an index past the end of the table. */
export function cellLayoutAt(cells: readonly CellLayout[], index: number): CellLayout {
  return cells[index] ?? { length: 0, offset: cells[cells.length - 1]?.offset ?? 0, index }
}
