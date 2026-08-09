import { describe, expect, it } from 'vitest'
import {
  buildSectionListLayout,
  cellLayoutAt,
  LINE_HEIGHTS,
  listRowHeight,
  sectionHeaderHeight,
} from '../listRowMetrics'

const ROW_CHROME = 11 * 2 + 0.5

describe('listRowHeight', () => {
  it('measures a title-only row from the title line plus the row chrome', () => {
    expect(listRowHeight({ subtitle: false, key: false, meta: false })).toBe(
      ROW_CHROME + LINE_HEIGHTS.rowTitle,
    )
  })

  it('adds the subtitle line and its 2pt gap', () => {
    expect(listRowHeight({ subtitle: true, key: false, meta: false })).toBe(
      ROW_CHROME + LINE_HEIGHTS.rowTitle + 2 + LINE_HEIGHTS.rowSubtitle,
    )
  })

  it('takes the taller of the leading and trailing stacks', () => {
    // Key + time signature outgrow a lone title, so they drive the height.
    expect(listRowHeight({ subtitle: false, key: true, meta: true })).toBe(
      ROW_CHROME + LINE_HEIGHTS.rowKey + 2 + LINE_HEIGHTS.rowMeta,
    )
    // With a subtitle the leading stack wins again.
    expect(listRowHeight({ subtitle: true, key: true, meta: true })).toBe(
      ROW_CHROME + LINE_HEIGHTS.rowTitle + 2 + LINE_HEIGHTS.rowSubtitle,
    )
  })

  it('drops the trailing gap when only the key renders', () => {
    expect(listRowHeight({ subtitle: false, key: true, meta: false })).toBe(
      ROW_CHROME + LINE_HEIGHTS.rowTitle,
    )
    expect(listRowHeight({ subtitle: false, key: false, meta: true })).toBe(
      ROW_CHROME + LINE_HEIGHTS.rowTitle,
    )
  })

  it('scales text but not the paddings with the OS font scale', () => {
    expect(listRowHeight({ subtitle: true, key: false, meta: false }, 2)).toBe(
      ROW_CHROME + LINE_HEIGHTS.rowTitle * 2 + 2 + LINE_HEIGHTS.rowSubtitle * 2,
    )
  })
})

describe('sectionHeaderHeight', () => {
  it('is the label line plus its paddings', () => {
    expect(sectionHeaderHeight()).toBe(7 + 4 + LINE_HEIGHTS.sectionHeader)
    expect(sectionHeaderHeight(1.5)).toBe(7 + 4 + LINE_HEIGHTS.sectionHeader * 1.5)
  })
})

describe('buildSectionListLayout', () => {
  const sections = [
    { title: 'A', data: ['a1', 'a2'] },
    { title: 'B', data: ['b1'] },
  ]
  const measure = { header: () => 30, item: () => 60 }

  it('emits header + items + a zero-height footer per section', () => {
    const cells = buildSectionListLayout(sections, measure)
    // 2 sections × (1 header + n items + 1 footer)
    expect(cells.map((c) => c.length)).toEqual([30, 60, 60, 0, 30, 60, 0])
  })

  it('runs offsets as a prefix sum with self-consistent indices', () => {
    const cells = buildSectionListLayout(sections, measure)
    expect(cells.map((c) => c.offset)).toEqual([0, 30, 90, 150, 150, 180, 240])
    expect(cells.map((c) => c.index)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('places section B where SectionList flattens it (data.length + 2 per section)', () => {
    const cells = buildSectionListLayout(sections, measure)
    const sectionBHeader = sections[0].data.length + 2
    expect(cells[sectionBHeader].offset).toBe(30 + 60 + 60)
  })

  it('measures each cell from its own section and item', () => {
    const cells = buildSectionListLayout(sections, {
      header: (_s, i) => (i === 0 ? 0 : 30),
      item: (item) => (item === 'a2' ? 100 : 60),
    })
    expect(cells.map((c) => c.length)).toEqual([0, 60, 100, 0, 30, 60, 0])
  })

  it('handles an empty section list', () => {
    expect(buildSectionListLayout([], measure)).toEqual([])
  })
})

describe('cellLayoutAt', () => {
  const cells = buildSectionListLayout([{ title: 'A', data: ['a1'] }], {
    header: () => 30,
    item: () => 60,
  })

  it('returns the measured cell', () => {
    expect(cellLayoutAt(cells, 1)).toEqual({ length: 60, offset: 30, index: 1 })
  })

  it('clamps past the end instead of returning undefined', () => {
    expect(cellLayoutAt(cells, 99)).toEqual({ length: 0, offset: 90, index: 99 })
    expect(cellLayoutAt([], 0)).toEqual({ length: 0, offset: 0, index: 0 })
  })
})
