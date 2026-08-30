import { describe, expect, it } from 'vitest'
import { PHONE_ARC, arcLayout, polar, ringExitX, slotAngle } from '../arcGeometry'

// The narrowest phone the app supports. The arc is FULL-BLEED — the page's 16pt
// padding stops at the scrolling rows above it — so the budget is the whole
// width, and what matters is the margin at the widest bubbles.
const SCREEN = 375
const HALF = SCREEN / 2

const layout = arcLayout(PHONE_ARC, SCREEN)

function centre(ring: 'major' | 'minor', slot: number) {
  return polar(PHONE_ARC, ring, slotAngle(PHONE_ARC, ring, slot))
}

describe('the arc at 375pt', () => {
  it('keeps a real margin at the widest bubbles', () => {
    const widest = Math.max(...layout.nodes.map((n) => Math.abs(n.x) + n.size / 2))
    expect(widest).toBeCloseTo(179.0, 1)
    expect(HALF - widest).toBeGreaterThan(8)
  })

  it('never lets a bubble cross the screen edge', () => {
    for (const node of layout.nodes) {
      expect(node.left).toBeGreaterThan(0)
      expect(node.left + node.size).toBeLessThan(SCREEN)
    }
  })

  it('crops to roughly 120 degrees of circle on the outer ring', () => {
    const span = slotAngle(PHONE_ARC, 'major', 2) - slotAngle(PHONE_ARC, 'major', -2)
    expect(span).toBe(120)
  })

  it('drops 86pt from the I chord to the edge positions', () => {
    expect(centre('major', 2).y - centre('major', 0).y).toBeCloseTo(86, 1)
  })

  it('stays inside the vertical third the list above it leaves', () => {
    expect(layout.height).toBe(188)
    expect(layout.height).toBeLessThanOrEqual(210)
  })

  it('leaves room above the tonic halo so it is never clipped', () => {
    const haloTop = layout.centerY - PHONE_ARC.outerRadius - PHONE_ARC.tonicHaloSize / 2
    expect(haloTop).toBeGreaterThanOrEqual(0)
  })

  it('extends over the home-indicator inset so the face runs off the bottom', () => {
    const extended = arcLayout(PHONE_ARC, SCREEN, 34)
    expect(extended.height).toBe(layout.height + 34)
    // The centre must NOT move, or the whole dial would shift on notched phones.
    expect(extended.centerY).toBe(layout.centerY)
    // Near the extended bottom the face is still almost the full screen width.
    expect(2 * ringExitX(PHONE_ARC, 'major', 34)).toBeGreaterThan(SCREEN - 40)
  })

  it('puts the circle centre below everything drawn', () => {
    expect(layout.centerY).toBe(layout.height + PHONE_ARC.centerDrop)
    expect(layout.centerY).toBeGreaterThan(layout.height)
    for (const node of layout.nodes) expect(node.top + node.size).toBeLessThan(layout.height)
  })
})

describe('the stroked rings', () => {
  it('leaves the frame through the bottom edge, close to the corners', () => {
    // A circle through the bubble centres is widest at ±R, so it cannot reach the
    // 187.5pt screen edge without flattening the arc; instead the crop cuts it
    // near the bottom corners, on a near-vertical tangent.
    const outer = ringExitX(PHONE_ARC, 'major')
    expect(outer).toBeCloseTo(170.8, 1)
    expect(HALF - outer).toBeLessThan(20)
  })

  it('cuts the inner ring at the bottom edge too, so neither ring curls back', () => {
    const inner = ringExitX(PHONE_ARC, 'minor')
    expect(inner).toBeCloseTo(114.3, 1)
    // Both exits are below the lowest bubble, so each stroke runs past its own
    // outermost position before it leaves.
    const lowestBubbleAboveCentre = Math.min(
      ...layout.nodes.map((n) => -n.y - n.size / 2),
    )
    expect(lowestBubbleAboveCentre).toBeGreaterThan(PHONE_ARC.centerDrop)
  })
})

describe('tap targets', () => {
  it('meets the 44pt minimum on both rings, inner minors included', () => {
    for (const node of layout.nodes) expect(node.size).toBeGreaterThanOrEqual(44)
  })

  it('never overlaps two bubbles', () => {
    for (let a = 0; a < layout.nodes.length; a++) {
      for (let b = a + 1; b < layout.nodes.length; b++) {
        const first = layout.nodes[a]
        const second = layout.nodes[b]
        const distance = Math.hypot(first.x - second.x, first.y - second.y)
        expect(distance - (first.size + second.size) / 2).toBeGreaterThan(0)
      }
    }
  })

  it('keeps a visible gap, not merely a positive one', () => {
    const gaps: number[] = []
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

describe('true circle-of-fifths spacing', () => {
  it('runs both rings at the same 30 degree step, with no schematic fudge', () => {
    expect(PHONE_ARC.majorStep).toBe(30)
    expect(PHONE_ARC.minorStep).toBe(30)
  })

  it('centres the inner ring under the tonic', () => {
    // Four inner chords against three outer ones: aligning them radially leaves
    // the set hanging off to the right, so the ring is rotated half a step.
    expect(PHONE_ARC.minorAngleOffset).toBe(-PHONE_ARC.minorStep / 2)
    const xs = PHONE_ARC.minorSlots.map((slot) => centre('minor', slot).x)
    expect(Math.min(...xs)).toBeCloseTo(-Math.max(...xs), 5)
  })

  it('sits every minor between two majors rather than under one', () => {
    for (const slot of PHONE_ARC.minorSlots) {
      const angle = slotAngle(PHONE_ARC, 'minor', slot)
      expect(angle % PHONE_ARC.majorStep).not.toBe(0)
    }
  })

  it('has room for true spacing only because the inner radius grew', () => {
    // At the old 97pt inner radius the true chord was 50.2pt, which left 44pt
    // bubbles a 6.2pt gap and is why the ring used to be widened to 36°.
    const chord =
      2 * PHONE_ARC.innerRadius * Math.sin((PHONE_ARC.minorStep * Math.PI) / 360)
    expect(chord).toBeCloseTo(60.0, 1)
    expect(chord - PHONE_ARC.minorSize).toBeGreaterThan(8)
  })
})

describe('the rings', () => {
  it('carries IV I V outside and ii vi iii vii° inside', () => {
    expect(PHONE_ARC.majorSlots).toEqual([-2, -1, 0, 1, 2])
    expect(PHONE_ARC.minorSlots).toEqual([-1, 0, 1, 2])
  })

  it('runs the inner ring one position further right, where the vii° lives', () => {
    // Asymmetric on purpose: a key has three majors and four everything-else
    // chords, and the position left of ii holds no chord that is in the key.
    const innerMax = Math.max(...PHONE_ARC.minorSlots)
    const innerMin = Math.min(...PHONE_ARC.minorSlots)
    expect(innerMax).toBe(2)
    expect(innerMin).toBe(-1)
    expect(centre('minor', 2).x).toBeGreaterThan(0)
  })

  it('puts the tonic at the top', () => {
    expect(centre('major', 0).x).toBeCloseTo(0)
  })

  it('clears the tonic halo of every other bubble', () => {
    const tonic = centre('major', 0)
    const halo = PHONE_ARC.tonicHaloSize / 2
    for (const node of layout.nodes) {
      if (node.ring === 'major' && node.slot === 0) continue
      const distance = Math.hypot(tonic.x - node.x, tonic.y - node.y)
      expect(distance - halo - node.size / 2).toBeGreaterThanOrEqual(8)
    }
  })
})
