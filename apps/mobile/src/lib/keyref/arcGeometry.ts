// Where every bubble on the cropped circle-of-fifths arc sits.
//
// Both rings run at TRUE 30° circle-of-fifths spacing, perfectly concentric,
// with each relative minor exactly beneath its parent. An earlier revision had
// to widen the inner ring to 36° because at a 97pt inner radius the true chord
// between adjacent minors is 50pt, which leaves 44pt bubbles a 6pt gap and
// breaks their tap targets. Growing the outer radius to 170 lets the inner ring
// grow to 110, where the true chord is 56.9pt — so the fudge is gone and the
// geometry is now the real thing.
//
// The outer radius is fixed by WIDTH, not by taste: at 375pt the widest bubbles
// reach ±175.2 against a 187.5pt half-width, leaving 12.3pt of margin. 170 is
// the largest round radius that still clears the edge, so the arc is the element
// that flexes if the rows above it grow — not the other way round.
//
// A NOTE ON THE ARC RUNNING OFF THE SCREEN. A circle through the bubble centres
// is widest at ±R, so reaching the 187.5pt screen edge needs R > 187.5 — which
// the bubble-margin constraint above forbids. Rather than flatten the arc to
// ~62pt of drop for a literal edge overrun, the circle keeps its 85pt drop and
// its ends are cropped by the container's BOTTOM edge, at ±168.8 — 18.7pt from
// each corner, on a near-vertical tangent, so they read as plunging off rather
// than curling back. Curvature was the problem; curvature wins.
//
// The numbers are separated from the component so they can be asserted headless
// (`__tests__/arcGeometry.test.ts` checks the 44pt tap-target floor, that no two
// bubbles overlap, and that the whole thing fits 375pt), following the same
// split as readerSwipe.ts.

/**
 * A layout variant. Only PHONE_ARC exists today; the shape is parameterized
 * rather than hardcoded so a future fuller-circle layout is a new constant here
 * plus different angles, not a rewrite of KeyArc. Deliberately NOT branched on
 * size class anywhere — that decision isn't made yet.
 */
export type ArcVariant = {
  /** Radius of the major (outer) ring. */
  outerRadius: number
  /** Radius of the minor (inner) ring. */
  innerRadius: number
  majorSize: number
  minorSize: number
  /** Angular step between adjacent majors. True circle of fifths. */
  majorStep: number
  /** Angular step between adjacent minors. Also true — see the note above. */
  minorStep: number
  /** Slot offsets drawn on the outer ring (0 is the tonic). */
  majorSlots: readonly number[]
  /** Slot offsets drawn on the inner ring. */
  minorSlots: readonly number[]
  /** |offset| at which a major is drawn faded rather than solid. */
  fadedFrom: number
  /**
   * How far below the laid-out box's bottom edge the circle's centre sits. This
   * is the crop: it decides how much bare arc shows past the outermost bubbles
   * and where the two strokes leave the frame.
   */
  centerDrop: number
  /** Hairline weight of the two ring strokes. */
  ringStroke: number
  /** Radial length of a detent tick. */
  tickLength: number
  /**
   * Diameter of the halo behind the tonic. It marks the top of the dial rather
   * than a bubble, so it does NOT travel with the wheel — bubbles slide through
   * it, which is what makes it read as an index rather than as a selection.
   */
  tonicHaloSize: number
  /** Angular half-span over which ticks are visible, and their fade width. */
  tickSpan: number
  tickFade: number
}

export const PHONE_ARC: ArcVariant = {
  outerRadius: 170,
  innerRadius: 110,
  majorSize: 56,
  minorSize: 48,
  majorStep: 30,
  minorStep: 30,
  // IV I V plus one faded neighbour each way — 5 positions × 30° = the ~120° of
  // visible circle the arc crops to.
  majorSlots: [-2, -1, 0, 1, 2],
  // ii vi iii vii° — the four non-major diatonic triads, in fifths order. There
  // is deliberately no fifth position on the left: the chord that would sit
  // there is not in the key, and inventing one to balance the drawing would make
  // the picture prettier and the teaching worse.
  minorSlots: [-1, 0, 1, 2],
  fadedFrom: 2,
  centerDrop: 20,
  ringStroke: 1,
  tickLength: 6,
  // Clears the relative minor below it by 2pt and IV/V by 26pt.
  tonicHaloSize: 68,
  tickSpan: 78,
  tickFade: 12,
}

export type ArcRing = 'major' | 'minor'

export type ArcNode = {
  ring: ArcRing
  /** Offset from the tonic in fifths. */
  slot: number
  size: number
  /** Degrees clockwise from twelve o'clock, at rest. */
  angle: number
  /** Centre relative to the circle centre (y grows downward, so these are negative). */
  x: number
  y: number
  /** Top-left of the bubble within the laid-out arc box. */
  left: number
  top: number
}

export type ArcLayout = {
  /** Full-bleed: the box is as wide as the viewport so the strokes can run out. */
  width: number
  height: number
  /** Circle centre within the box. `centerY` is below the box's bottom edge. */
  centerX: number
  centerY: number
  nodes: ArcNode[]
}

const rad = (deg: number) => (deg * Math.PI) / 180

/** Angle of a slot on a given ring, at rest. */
export function slotAngle(v: ArcVariant, ring: ArcRing, slot: number): number {
  return slot * (ring === 'major' ? v.majorStep : v.minorStep)
}

function ringRadius(v: ArcVariant, ring: ArcRing): number {
  return ring === 'major' ? v.outerRadius : v.innerRadius
}

function ringSize(v: ArcVariant, ring: ArcRing): number {
  return ring === 'major' ? v.majorSize : v.minorSize
}

/** Bubble centre for a ring/angle pair, relative to the circle centre. */
export function polar(v: ArcVariant, ring: ArcRing, angle: number): { x: number; y: number } {
  const r = ringRadius(v, ring)
  return { x: r * Math.sin(rad(angle)), y: -r * Math.cos(rad(angle)) }
}

/**
 * The resting layout for a `width`-wide viewport. The height is set by the crop
 * rather than by the bubbles, so the box always extends past the outermost
 * bubbles to the point where the strokes leave the frame.
 *
 * The component positions bubbles from `centerX`/`centerY` at run time (angles
 * move with the drag), so `left`/`top` here describe the at-rest arrangement the
 * tests assert against.
 */
export function arcLayout(v: ArcVariant, width: number): ArcLayout {
  const height = v.outerRadius + v.majorSize / 2 - v.centerDrop
  const centerX = width / 2
  const centerY = height + v.centerDrop

  const nodes = [
    ...v.majorSlots.map((slot) => ({ ring: 'major' as const, slot })),
    ...v.minorSlots.map((slot) => ({ ring: 'minor' as const, slot })),
  ].map(({ ring, slot }) => {
    const angle = slotAngle(v, ring, slot)
    const { x, y } = polar(v, ring, angle)
    const size = ringSize(v, ring)
    return {
      ring,
      slot,
      size,
      angle,
      x,
      y,
      left: centerX + x - size / 2,
      top: centerY + y - size / 2,
    }
  })

  return { width, height, centerX, centerY, nodes }
}

/** Where a stroked ring leaves the box's bottom edge, as ±x from the centre. */
export function ringExitX(v: ArcVariant, ring: ArcRing): number {
  const r = ringRadius(v, ring)
  return Math.sqrt(Math.max(0, r * r - v.centerDrop * v.centerDrop))
}

/**
 * Opacity for a bubble whose live offset from the tonic is `offset` (fractional
 * mid-drag).
 *
 * Majors hold full strength out to ±1 — IV, I, V — then dim through the
 * neighbour positions that show the circle continues, and vanish past ±2.6.
 *
 * The inner ring is ASYMMETRIC, and deliberately: it runs full strength from -1
 * to +2, because +2 is the vii°, which is diatonic to the key even though the
 * faded neighbour directly above it is not. Letting it inherit its column's
 * fade would hide a chord that is genuinely in the key.
 */
export function bubbleOpacity(ring: ArcRing, offset: number): number {
  'worklet'
  if (ring === 'minor') {
    if (offset >= -1 && offset <= 2) return 1
    const over = offset < -1 ? -1 - offset : offset - 2
    return Math.max(0, 1 - over / 0.6)
  }
  const distance = Math.abs(offset)
  if (distance <= 1) return 1
  if (distance <= 2) return 1 - (distance - 1) * 0.55
  return Math.max(0, 0.45 * (1 - (distance - 2) / 0.6))
}
