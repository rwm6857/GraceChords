import { describe, expect, it } from 'vitest'
import {
  END_MAX,
  FLICK_VELOCITY,
  OVERDRAG_MAX,
  THRESHOLD_MAX,
  THRESHOLD_MIN,
  dragTravel,
  isForwardDrag,
  shouldCommitSwipe,
  swipeProgress,
  swipeThreshold,
} from '../readerSwipe'

// A representative phone width; 390 * 0.22 = 85.8, inside the clamp.
const PHONE = 390
const PHONE_THRESHOLD = swipeThreshold(PHONE)

describe('swipeThreshold', () => {
  it('scales with the window between the min and max clamps', () => {
    expect(PHONE_THRESHOLD).toBeCloseTo(85.8)
  })

  it('clamps so a tiny window still needs a real drag', () => {
    expect(swipeThreshold(200)).toBe(THRESHOLD_MIN)
  })

  it('clamps so a tablet does not demand an arm-length swipe', () => {
    expect(swipeThreshold(1024)).toBe(THRESHOLD_MAX)
  })
})

describe('isForwardDrag', () => {
  it('treats a leftward drag as forward when reading left-to-right', () => {
    expect(isForwardDrag(-40, false)).toBe(true)
    expect(isForwardDrag(40, false)).toBe(false)
  })

  it('flips for right-to-left scripts', () => {
    expect(isForwardDrag(-40, true)).toBe(false)
    expect(isForwardDrag(40, true)).toBe(true)
  })
})

describe('dragTravel', () => {
  it('tracks the finger 1:1 up to the threshold, in both directions', () => {
    expect(dragTravel(-30, PHONE_THRESHOLD, true)).toBe(-30)
    expect(dragTravel(60, PHONE_THRESHOLD, true)).toBe(60)
    expect(dragTravel(-PHONE_THRESHOLD, PHONE_THRESHOLD, true)).toBe(-PHONE_THRESHOLD)
  })

  it('slows past the threshold so the commit point reads as a detent', () => {
    const past = dragTravel(-(PHONE_THRESHOLD + 100), PHONE_THRESHOLD, true)
    expect(Math.abs(past)).toBeGreaterThan(PHONE_THRESHOLD)
    expect(Math.abs(past)).toBeLessThan(PHONE_THRESHOLD + 100)
  })

  it('caps over-drag however far the finger goes', () => {
    expect(Math.abs(dragTravel(-2000, PHONE_THRESHOLD, true))).toBe(PHONE_THRESHOLD + OVERDRAG_MAX)
  })

  it('never crosses the threshold at the first/last reading', () => {
    for (const raw of [-40, -120, -400, -2000, 40, 120, 400, 2000]) {
      const travel = Math.abs(dragTravel(raw, PHONE_THRESHOLD, false))
      expect(travel).toBeLessThanOrEqual(END_MAX)
      expect(travel).toBeLessThan(PHONE_THRESHOLD)
    }
  })

  it('still moves a little at the wall, so the stop is felt not dead', () => {
    expect(dragTravel(-100, PHONE_THRESHOLD, false)).toBeLessThan(0)
  })

  it('is monotonic and sign-preserving', () => {
    let previous = 0
    for (const raw of [-5, -50, -86, -150, -600]) {
      const travel = dragTravel(raw, PHONE_THRESHOLD, true)
      expect(travel).toBeLessThanOrEqual(previous)
      previous = travel
    }
  })
})

describe('shouldCommitSwipe', () => {
  it('commits a slow drag once it passes the threshold', () => {
    expect(shouldCommitSwipe(PHONE_THRESHOLD, 0, PHONE_THRESHOLD)).toBe(true)
    expect(shouldCommitSwipe(PHONE_THRESHOLD - 1, 0, PHONE_THRESHOLD)).toBe(false)
  })

  it('commits a fast flick from past halfway', () => {
    const half = PHONE_THRESHOLD * 0.5
    expect(shouldCommitSwipe(half + 1, -(FLICK_VELOCITY + 1), PHONE_THRESHOLD)).toBe(true)
    expect(shouldCommitSwipe(half + 1, FLICK_VELOCITY + 1, PHONE_THRESHOLD)).toBe(true)
  })

  it('ignores a fast flick that barely moved', () => {
    expect(shouldCommitSwipe(4, -3000, PHONE_THRESHOLD)).toBe(false)
  })

  it('ignores a slow drag that stopped short', () => {
    expect(shouldCommitSwipe(PHONE_THRESHOLD * 0.9, 100, PHONE_THRESHOLD)).toBe(false)
  })
})

describe('swipeProgress', () => {
  it('runs 0 → 1 across the threshold and clamps beyond it', () => {
    expect(swipeProgress(0, PHONE_THRESHOLD)).toBe(0)
    expect(swipeProgress(PHONE_THRESHOLD / 2, PHONE_THRESHOLD)).toBeCloseTo(0.5)
    expect(swipeProgress(PHONE_THRESHOLD, PHONE_THRESHOLD)).toBe(1)
    expect(swipeProgress(PHONE_THRESHOLD * 3, PHONE_THRESHOLD)).toBe(1)
  })

  it('stays at 0 for a drag heading the other way', () => {
    expect(swipeProgress(-50, PHONE_THRESHOLD)).toBe(0)
  })
})
