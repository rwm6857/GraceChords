import { describe, expect, it } from 'vitest'
import { MIN_COLUMN_WIDTH, maxColumnsFor } from '../columnCapacity'

const GAP = 16
/** Chart padding is spacing.lg on each side. */
const pad = (w: number) => w - GAP * 2

// Real device points, so a regression shows up as "an iPad mini grew a third
// column" rather than an abstract number change.
const IPHONE_15 = { min: 393, portrait: 393, landscape: 852 }
const IPAD_MINI = { min: 744, portrait: 744, landscape: 1133 }
const IPAD_AIR_11 = { min: 820, portrait: 820, landscape: 1180 }
const IPAD_PRO_13 = { min: 1024, portrait: 1024, landscape: 1366 }

describe('maxColumnsFor device tier', () => {
  it('phones never get a second column, in either orientation', () => {
    expect(maxColumnsFor(IPHONE_15.min, pad(IPHONE_15.portrait), GAP)).toBe(1)
    // Landscape is wide enough for two 300pt columns, but the device tier wins.
    expect(maxColumnsFor(IPHONE_15.min, pad(IPHONE_15.landscape), GAP)).toBe(1)
  })

  it('caps an iPad mini at 2 columns even in landscape', () => {
    expect(maxColumnsFor(IPAD_MINI.min, pad(IPAD_MINI.portrait), GAP)).toBe(2)
    expect(maxColumnsFor(IPAD_MINI.min, pad(IPAD_MINI.landscape), GAP)).toBe(2)
  })

  it('lets larger tablets reach 3 when the width allows', () => {
    expect(maxColumnsFor(IPAD_AIR_11.min, pad(IPAD_AIR_11.landscape), GAP)).toBe(3)
    expect(maxColumnsFor(IPAD_PRO_13.min, pad(IPAD_PRO_13.landscape), GAP)).toBe(3)
    expect(maxColumnsFor(IPAD_PRO_13.min, pad(IPAD_PRO_13.portrait), GAP)).toBe(3)
  })
})

describe('maxColumnsFor width cap', () => {
  it('keeps an 11" iPad at 2 columns in portrait — 3 would be too narrow', () => {
    // 820 - 32 = 788 content; three columns would be ~252pt each.
    expect(maxColumnsFor(IPAD_AIR_11.min, pad(IPAD_AIR_11.portrait), GAP)).toBe(2)
  })

  it('takes whichever cap is tighter', () => {
    // Tier says 3, width says 1.
    expect(maxColumnsFor(1024, MIN_COLUMN_WIDTH + 10, GAP)).toBe(1)
    // Tier says 2, width says 3.
    expect(maxColumnsFor(744, MIN_COLUMN_WIDTH * 3 + GAP * 2, GAP)).toBe(2)
  })

  it('fits exactly N columns at exactly N * MIN_COLUMN_WIDTH + gaps', () => {
    const exactlyThree = MIN_COLUMN_WIDTH * 3 + GAP * 2
    expect(maxColumnsFor(1024, exactlyThree, GAP)).toBe(3)
    expect(maxColumnsFor(1024, exactlyThree - 1, GAP)).toBe(2)
  })

  it('falls back to the device tier before layout reports a width', () => {
    expect(maxColumnsFor(IPAD_PRO_13.min, 0, GAP)).toBe(3)
    expect(maxColumnsFor(IPAD_MINI.min, 0, GAP)).toBe(2)
    expect(maxColumnsFor(IPHONE_15.min, 0, GAP)).toBe(1)
  })

  it('never returns less than 1', () => {
    expect(maxColumnsFor(1024, 10, GAP)).toBe(1)
  })
})
