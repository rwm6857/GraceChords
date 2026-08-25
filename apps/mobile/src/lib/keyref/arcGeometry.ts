// Where every bubble on the cropped circle-of-fifths arc sits.
//
// THIS IS A SCHEMATIC, NOT A SCALE DRAWING. True 30° spacing on the inner ring
// puts the relative minors 50pt apart center-to-center, which leaves a 6pt gap
// between 44pt bubbles — overlapping tap targets. The minors are therefore
// spaced 36°, which opens that to 60pt / 16pt while keeping each minor visibly
// nested under its parent (6° of drift at i=±1 is 8.5pt, and the minor is still
// 20pt inboard of the major it belongs to).
//
// The outer radius is fixed by WIDTH, not by taste: at 375pt the content box is
// 343pt, and 155·sin60° + 28 = 162.2 against a 171.5pt half-width. 155 is the
// largest round radius that still leaves a real side margin, so the arc is the
// element that flexes if the rows above it grow — not the other way round.
//
// The numbers are separated from the component so they can be asserted headless
// (`__tests__/arcGeometry.test.ts` checks the 44pt tap-target floor, that no two
// bubbles overlap, and that the whole thing fits 343pt), following the same
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
  /** Radius of the relative-minor (inner) ring. */
  innerRadius: number
  /** Radius of the single vii° bubble on the third ring. */
  dimRadius: number
  majorSize: number
  minorSize: number
  dimSize: number
  /** Angular step between adjacent majors. True circle of fifths. */
  majorStep: number
  /** Angular step between adjacent minors — widened; see the note above. */
  minorStep: number
  /** Slot offsets drawn on the outer ring (0 is the tonic). */
  majorSlots: readonly number[]
  /** Slot offsets drawn on the inner ring. */
  minorSlots: readonly number[]
  /** |offset| at which a major is drawn faded rather than solid. */
  fadedFrom: number
}

export const PHONE_ARC: ArcVariant = {
  outerRadius: 155,
  innerRadius: 97,
  dimRadius: 45,
  majorSize: 56,
  minorSize: 44,
  dimSize: 44,
  majorStep: 30,
  minorStep: 36,
  // IV I V plus one faded neighbour each way — 5 positions × 30° = the ~120°
  // of visible circle the arc crops to.
  majorSlots: [-2, -1, 0, 1, 2],
  minorSlots: [-1, 0, 1],
  fadedFrom: 2,
}

export type ArcRing = 'major' | 'minor' | 'dim'

export type ArcNode = {
  ring: ArcRing
  /** Offset from the tonic in fifths. 0 for the dim bubble. */
  slot: number
  size: number
  /** Degrees clockwise from twelve o'clock, at rest. */
  angle: number
  /** Center relative to the circle center (y grows downward, so these are negative). */
  x: number
  y: number
  /** Top-left of the bubble within the laid-out arc box. */
  left: number
  top: number
}

export type ArcLayout = {
  width: number
  height: number
  /** Circle center within the box. `centerY` is below the box's bottom edge. */
  centerX: number
  centerY: number
  nodes: ArcNode[]
}

const rad = (deg: number) => (deg * Math.PI) / 180

/** Angle of a slot on a given ring, at rest. */
export function slotAngle(v: ArcVariant, ring: ArcRing, slot: number): number {
  if (ring === 'dim') return 0
  return slot * (ring === 'major' ? v.majorStep : v.minorStep)
}

function ringRadius(v: ArcVariant, ring: ArcRing): number {
  return ring === 'major' ? v.outerRadius : ring === 'minor' ? v.innerRadius : v.dimRadius
}

function ringSize(v: ArcVariant, ring: ArcRing): number {
  return ring === 'major' ? v.majorSize : ring === 'minor' ? v.minorSize : v.dimSize
}

/** Bubble center for a ring/angle pair, relative to the circle center. */
export function polar(v: ArcVariant, ring: ArcRing, angle: number): { x: number; y: number } {
  const r = ringRadius(v, ring)
  return { x: r * Math.sin(rad(angle)), y: -r * Math.cos(rad(angle)) }
}

/**
 * The resting layout: every bubble placed, and the box that contains them. The
 * component positions bubbles from `centerX`/`centerY` at run time (angles move
 * with the drag), so `left`/`top` here describe the at-rest arrangement the
 * tests assert against.
 */
export function arcLayout(v: ArcVariant): ArcLayout {
  const placed = [
    ...v.majorSlots.map((slot) => ({ ring: 'major' as const, slot })),
    ...v.minorSlots.map((slot) => ({ ring: 'minor' as const, slot })),
    { ring: 'dim' as const, slot: 0 },
  ].map(({ ring, slot }) => {
    const angle = slotAngle(v, ring, slot)
    const { x, y } = polar(v, ring, angle)
    return { ring, slot, size: ringSize(v, ring), angle, x, y }
  })

  const minX = Math.min(...placed.map((n) => n.x - n.size / 2))
  const maxX = Math.max(...placed.map((n) => n.x + n.size / 2))
  const minY = Math.min(...placed.map((n) => n.y - n.size / 2))
  const maxY = Math.max(...placed.map((n) => n.y + n.size / 2))

  return {
    width: maxX - minX,
    height: maxY - minY,
    centerX: -minX,
    centerY: -minY,
    nodes: placed.map((n) => ({ ...n, left: n.x - n.size / 2 - minX, top: n.y - n.size / 2 - minY })),
  }
}

/**
 * Opacity for a bubble whose live offset from the tonic is `offset` (fractional
 * mid-drag). Majors hold full strength out to ±1 — IV, I, V — then fade through
 * the neighbour positions that show the circle continues, and vanish past ±2.6.
 * Minors are gone by ±1.5: the three relative minors are the point of the inner
 * ring, and faded extras would crowd the arc's crowded lower corners with
 * low-contrast duplicates of a tap target that already exists above them.
 *
 * The vii° is exempt. It is one bubble that belongs to the current key rather
 * than a slot on the wheel, so it does not travel and has no offset to fade on;
 * KeyArc fades it for the duration of a drag instead.
 */
export function bubbleOpacity(ring: ArcRing, offset: number): number {
  'worklet'
  if (ring === 'dim') return 1
  const distance = Math.abs(offset)
  if (ring === 'minor') {
    if (distance <= 1) return 1
    return Math.max(0, 1 - (distance - 1) / 0.5)
  }
  if (distance <= 1) return 1
  if (distance <= 2) return 1 - (distance - 1) * 0.65
  return Math.max(0, 0.35 * (1 - (distance - 2) / 0.6))
}
