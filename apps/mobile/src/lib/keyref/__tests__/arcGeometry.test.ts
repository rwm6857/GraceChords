import { describe, expect, it } from 'vitest'
import { PHONE_ARC, arcLayout, polar, slotAngle } from '../arcGeometry'

// The narrowest phone the app supports: 375pt wide, 16pt of page padding a side.
const CONTENT_WIDTH = 375 - 16 * 2

const layout = arcLayout(PHONE_ARC)

function centre(ring: 'major' | 'minor' | 'dim', slot: number) {
  return polar(PHONE_ARC, ring, slotAngle(PHONE_ARC, ring, slot))
}

describe('the arc at 375pt', () => {
  it('fits the content width with a real margin', () => {
    expect(layout.width).toBeLessThanOrEqual(CONTENT_WIDTH)
    expect(CONTENT_WIDTH - layout.width).toBeGreaterThan(12)
  })

  it('stays inside the vertical budget the rows above it leave', () => {
    // Worst case is a three-phrase progression on a 375x667 screen, which leaves
    // about 336pt for the arc block.
    expect(layout.height).toBeLessThanOrEqual(200)
  })

  it('crops to roughly 120 degrees of circle', () => {
    const span = slotAngle(PHONE_ARC, 'major', 2) - slotAngle(PHONE_ARC, 'major', -2)
    expect(span).toBe(120)
  })

  it('drops about 78pt from the top of the arc to its edges', () => {
    const drop = centre('major', 2).y - centre('major', 0).y
    expect(drop).toBeCloseTo(77.5, 1)
  })

  it('puts the circle centre below everything drawn', () => {
    expect(layout.centerY).toBeGreaterThanOrEqual(layout.height)
  })
})

describe('tap targets', () => {
  it('meets the 44pt minimum on every ring, inner minors included', () => {
    for (const node of layout.nodes) {
      expect(node.size).toBeGreaterThanOrEqual(44)
    }
  })

  it('never overlaps two bubbles', () => {
    for (let a = 0; a < layout.nodes.length; a++) {
      for (let b = a + 1; b < layout.nodes.length; b++) {
        const first = layout.nodes[a]
        const second = layout.nodes[b]
        const distance = Math.hypot(first.x - second.x, first.y - second.y)
        const gap = distance - (first.size + second.size) / 2
        expect(gap).toBeGreaterThan(0)
      }
    }
  })

  it('keeps a visible gap, not merely a positive one', () => {
    const gaps = []
    for (let a = 0; a < layout.nodes.length; a++) {
      for (let b = a + 1; b < layout.nodes.length; b++) {
        const first = layout.nodes[a]
        const second = layout.nodes[b]
        gaps.push(
          Math.hypot(first.x - second.x, first.y - second.y) - (first.size + second.size) / 2,
        )
      }
    }
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(8)
  })
})

describe('the schematic', () => {
  it('spaces the minors wider than true geometry would', () => {
    // True 30° spacing puts them ~50pt apart, which leaves 44pt bubbles a 6pt
    // gap; the widened step is the whole reason the inner ring is usable.
    expect(PHONE_ARC.minorStep).toBeGreaterThan(PHONE_ARC.majorStep)
    const trueSpacing =
      2 * PHONE_ARC.innerRadius * Math.sin((PHONE_ARC.majorStep * Math.PI) / 360)
    const actual = Math.hypot(
      centre('minor', 0).x - centre('minor', 1).x,
      centre('minor', 0).y - centre('minor', 1).y,
    )
    expect(trueSpacing - PHONE_ARC.minorSize).toBeLessThan(8)
    expect(actual - PHONE_ARC.minorSize).toBeGreaterThan(12)
  })

  it('still reads as nesting: a minor stays inboard of its parent', () => {
    for (const slot of [-1, 1]) {
      const major = centre('major', slot)
      const minor = centre('minor', slot)
      expect(Math.abs(minor.x)).toBeLessThan(Math.abs(major.x))
      expect(minor.y).toBeGreaterThan(major.y) // lower on screen
    }
  })

  it('places the tonic at the top and the vii° between the flanking minors', () => {
    expect(centre('major', 0).x).toBeCloseTo(0)
    expect(centre('dim', 0).x).toBeCloseTo(0)
    expect(centre('dim', 0).y).toBeGreaterThan(centre('minor', 0).y)
    expect(centre('dim', 0).y).toBeGreaterThan(centre('minor', 1).y)
  })
})
