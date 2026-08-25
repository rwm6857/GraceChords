// When the key wheel is allowed to fire a haptic, as pure policy with an
// injected clock — the same shape as routeDwell.ts, so the rules below are
// asserted headless rather than felt for on a device.
//
// The wheel has two haptics and they can collide. A selection TICK fires as each
// 30° detent boundary is crossed during the drag; a medium impact LOCK fires on
// release. Let go a few milliseconds after crossing a boundary and the two land
// close enough together to read as a stutter rather than as two events, so the
// lock is suppressed when it would follow a tick too closely.
//
// The other half of the rule matters just as much: a release that crossed NO
// boundary — a small nudge that snapped back to where it started — still fires
// the lock. Silence there reads as an unresponsive control.
//
// iOS only. Android's rotational motor produces a buzz rather than a tick, so
// the Android wheel snaps visually with no haptics at all; that is a decision,
// not a gap, and there is deliberately no fallback to fall back to.

/** A lock landing sooner than this after a tick reads as one stuttering event. */
export const LOCK_SUPPRESS_MS = 80

export type WheelHapticEvent = 'tick' | 'lock' | 'none'

/**
 * Should the release fire its lock? `lastTickAt` is null when the drag crossed
 * no boundary at all, which still locks.
 */
export function shouldFireLock(now: number, lastTickAt: number | null): boolean {
  if (lastTickAt == null) return true
  return now - lastTickAt >= LOCK_SUPPRESS_MS
}

export type WheelHaptics = {
  /** A detent boundary was crossed. Always fires. */
  tick(): WheelHapticEvent
  /** The drag ended. Fires unless it would stutter against the last tick. */
  lock(): WheelHapticEvent
  /** Forget the last tick — call when a new drag begins. */
  reset(): void
}

/**
 * Track tick timing across one drag. `now` is injected (Date.now in the app) so
 * tests can drive the clock; it is read on the JS side rather than in a worklet
 * because the UI runtime has no dependable wall clock, and both haptics already
 * cross to JS to be fired.
 */
export function createWheelHaptics(now: () => number): WheelHaptics {
  let lastTickAt: number | null = null
  return {
    tick() {
      lastTickAt = now()
      return 'tick'
    },
    lock() {
      const fire = shouldFireLock(now(), lastTickAt)
      lastTickAt = null
      return fire ? 'lock' : 'none'
    },
    reset() {
      lastTickAt = null
    },
  }
}
