import { describe, expect, it } from 'vitest'
import { LOCK_SUPPRESS_MS, createWheelHaptics, shouldFireLock } from '../wheelHaptics'

function clock(start = 1_000) {
  let now = start
  return { now: () => now, advance: (ms: number) => { now += ms } }
}

describe('shouldFireLock', () => {
  it('fires when the drag crossed no boundary at all', () => {
    // A small nudge that snapped back still has to be felt — silence there reads
    // as an unresponsive control.
    expect(shouldFireLock(1_000, null)).toBe(true)
  })

  it('suppresses a lock that would stutter against the last tick', () => {
    expect(shouldFireLock(1_000, 1_000)).toBe(false)
    expect(shouldFireLock(1_000 + LOCK_SUPPRESS_MS - 1, 1_000)).toBe(false)
  })

  it('fires once the gap is wide enough to read as two events', () => {
    expect(shouldFireLock(1_000 + LOCK_SUPPRESS_MS, 1_000)).toBe(true)
    expect(shouldFireLock(1_000 + 500, 1_000)).toBe(true)
  })
})

describe('a drag', () => {
  it('ticks on every boundary crossed', () => {
    const c = clock()
    const h = createWheelHaptics(c.now)
    expect(h.tick()).toBe('tick')
    c.advance(120)
    expect(h.tick()).toBe('tick')
  })

  it('locks on release when nothing was crossed', () => {
    const h = createWheelHaptics(clock().now)
    expect(h.lock()).toBe('lock')
  })

  it('does not double up when the release lands right after a crossing', () => {
    const c = clock()
    const h = createWheelHaptics(c.now)
    h.tick()
    c.advance(10)
    expect(h.lock()).toBe('none')
  })

  it('locks when the release comes a beat after the last crossing', () => {
    const c = clock()
    const h = createWheelHaptics(c.now)
    h.tick()
    c.advance(LOCK_SUPPRESS_MS + 1)
    expect(h.lock()).toBe('lock')
  })

  it('forgets the previous drag, so a fresh nudge still locks', () => {
    const c = clock()
    const h = createWheelHaptics(c.now)
    h.tick()
    h.reset()
    c.advance(1)
    expect(h.lock()).toBe('lock')
  })

  it('starts each release from a clean slate after locking once', () => {
    const c = clock()
    const h = createWheelHaptics(c.now)
    h.tick()
    c.advance(5)
    expect(h.lock()).toBe('none')
    // The next release crossed nothing of its own, so it is heard again.
    c.advance(5)
    expect(h.lock()).toBe('lock')
  })
})
