import type { Degree } from './types'

// The arithmetic behind the key wheel, kept out of the component so the *feel*
// is a set of testable numbers rather than constants buried in a worklet — the
// same split readerSwipe.ts uses for the reader's chapter swipe.
//
// Every function is a Reanimated worklet (the pan gesture calls them on the UI
// thread) but they are plain dependency-free math, so `npm run test` exercises
// them headless. The `'worklet'` directive is inert outside Reanimated.
//
// Rotation is measured in DEGREES OF WHEEL TRAVEL, positive clockwise. A bubble
// `slot` fifths from the tonic sits at `slot * 30 + rotation` on the outer ring,
// so rotation of +30 brings the flat-side neighbour (IV) to the top and -30
// brings the sharp-side one (V).

/** The twelve major keys in circle-of-fifths order. Index = wheel slot. */
export const FIFTHS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'] as const

export type WheelKey = (typeof FIFTHS)[number]

export const DETENT_COUNT = FIFTHS.length
/** One detent per key: twelve × 30° closes the circle exactly. */
export const DETENT_DEG = 360 / DETENT_COUNT

/** Below this radius a touch is too close to the center for angle tracking to be stable. */
export const MIN_DRAG_RADIUS = 70

/** The key `steps` fifths from `key`, wrapping the circle. */
export function keyAtOffset(key: string, steps: number): WheelKey {
  const base = FIFTHS.indexOf(key as WheelKey)
  const from = base === -1 ? 0 : base
  return FIFTHS[(((from + steps) % DETENT_COUNT) + DETENT_COUNT) % DETENT_COUNT]
}

/** Wheel slot for a key name, or 0 if unrecognized. */
export function keySlot(key: string): number {
  const index = FIFTHS.indexOf(key as WheelKey)
  return index === -1 ? 0 : index
}

/**
 * Shortest signed offset from the tonic slot to `slot`, in fifths — wrapped into
 * [-6, 5] so a bubble near the far side of the circle is drawn on whichever edge
 * it is actually closest to rather than spun all the way round.
 */
export function slotOffset(slot: number, tonicSlot: number): number {
  'worklet'
  const raw = ((((slot - tonicSlot) % DETENT_COUNT) + DETENT_COUNT) % DETENT_COUNT)
  return raw > DETENT_COUNT / 2 - 1 ? raw - DETENT_COUNT : raw
}

/** Angle of a touch around the circle center, in degrees clockwise from twelve o'clock. */
export function touchAngle(x: number, y: number, centerX: number, centerY: number): number {
  'worklet'
  return (Math.atan2(x - centerX, centerY - y) * 180) / Math.PI
}

/** Distance from the circle center — used to reject drags that start too near it. */
export function touchRadius(x: number, y: number, centerX: number, centerY: number): number {
  'worklet'
  return Math.hypot(x - centerX, centerY - y)
}

/** An angle folded into (-180, 180]. */
export function wrapDegrees(deg: number): number {
  'worklet'
  let wrapped = deg % 360
  if (wrapped > 180) wrapped -= 360
  if (wrapped <= -180) wrapped += 360
  return wrapped
}

/** Shortest signed difference `to - from`, wrapped into (-180, 180]. */
export function angleDelta(from: number, to: number): number {
  'worklet'
  return wrapDegrees(to - from)
}

/**
 * Rotation that puts `key` at the top, given the slot the wheel was built
 * around. Used to re-sync when the key is changed from outside the arc.
 */
export function rotationForKey(baseSlot: number, key: string): number {
  return (baseSlot - keySlot(key)) * DETENT_DEG
}

/**
 * Which detent the wheel currently sits nearest. It is the whole release policy
 * — no velocity is consulted anywhere, so the wheel stops where the finger
 * stopped and never flings — and latching on a CHANGE of this value is what
 * fires one selection tick per 30° crossed, in either direction, rather than one
 * per frame.
 *
 * A rotation of +1 detent brings the FLAT-side neighbour to the tonic: turning
 * the wheel clockwise pulls IV up to the top, as turning a physical disc would.
 */
export function crossingIndex(rotation: number): number {
  'worklet'
  return Math.round(rotation / DETENT_DEG)
}

/**
 * Where a scale degree lives on the arc. The three majors and three relative
 * minors cover six of the seven diatonic chords; the seventh, vii°, is the lone
 * bubble on the third ring.
 */
export const DEGREE_POSITION: Record<Degree, { ring: 'major' | 'minor' | 'dim'; slot: number }> = {
  1: { ring: 'major', slot: 0 },
  2: { ring: 'minor', slot: -1 },
  3: { ring: 'minor', slot: 1 },
  4: { ring: 'major', slot: -1 },
  5: { ring: 'major', slot: 1 },
  6: { ring: 'minor', slot: 0 },
  7: { ring: 'dim', slot: 0 },
}

/** Stable identity for an arc position, for highlight lookups. */
export function positionKey(ring: string, slot: number): string {
  return `${ring}:${slot}`
}
