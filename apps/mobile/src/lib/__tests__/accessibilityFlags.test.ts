import { afterEach, describe, expect, it } from 'vitest'
import {
  __resetAccessibilityFlagsForTest,
  DEFAULT_ACCESSIBILITY_FLAGS,
  getAccessibilityFlagsSnapshot,
  initAccessibilityFlags,
  type AccessibilityBackend,
} from '../accessibilityFlags'

// A controllable fake OS backend: the test captures each change/foreground
// callback and can fire it, and can flip the contrast value the foreground
// re-query reads.
function makeBackend(initial: { rm?: boolean; ic?: boolean; dwc?: boolean } = {}) {
  let ic = initial.ic ?? false
  const cbs: {
    rm?: (v: boolean) => void
    dwc?: (v: boolean) => void
    fg?: () => void
  } = {}
  const removed = { rm: false, dwc: false, fg: false }
  const backend: AccessibilityBackend = {
    isReduceMotionEnabled: async () => initial.rm ?? false,
    isIncreaseContrastEnabled: async () => ic,
    isDifferentiateWithoutColorEnabled: async () => initial.dwc ?? false,
    onReduceMotionChanged: (cb) => {
      cbs.rm = cb
      return { remove: () => void (removed.rm = true) }
    },
    onDifferentiateWithoutColorChanged: (cb) => {
      cbs.dwc = cb
      return { remove: () => void (removed.dwc = true) }
    },
    onForeground: (cb) => {
      cbs.fg = cb
      return { remove: () => void (removed.fg = true) }
    },
  }
  return { backend, cbs, removed, setContrast: (v: boolean) => void (ic = v) }
}

describe('accessibility flags store', () => {
  afterEach(() => __resetAccessibilityFlagsForTest())

  it('is all-false before init (vanilla device behavior)', () => {
    expect(getAccessibilityFlagsSnapshot()).toEqual(DEFAULT_ACCESSIBILITY_FLAGS)
    expect(getAccessibilityFlagsSnapshot()).toEqual({
      reduceMotion: false,
      increaseContrast: false,
      differentiateWithoutColor: false,
    })
  })

  it('seeds every flag from the backend once ready resolves', async () => {
    const { backend } = makeBackend({ rm: true, ic: true, dwc: true })
    const { ready, stop } = initAccessibilityFlags(backend)
    await ready
    expect(getAccessibilityFlagsSnapshot()).toEqual({
      reduceMotion: true,
      increaseContrast: true,
      differentiateWithoutColor: true,
    })
    stop()
  })

  it('reacts to reduce-motion and differentiate change events', async () => {
    const { backend, cbs } = makeBackend()
    const { ready, stop } = initAccessibilityFlags(backend)
    await ready
    cbs.rm?.(true)
    expect(getAccessibilityFlagsSnapshot().reduceMotion).toBe(true)
    cbs.dwc?.(true)
    expect(getAccessibilityFlagsSnapshot().differentiateWithoutColor).toBe(true)
    cbs.rm?.(false)
    expect(getAccessibilityFlagsSnapshot().reduceMotion).toBe(false)
    stop()
  })

  it('re-queries contrast on foreground (it has no change event)', async () => {
    const { backend, cbs, setContrast } = makeBackend({ ic: false })
    const { ready, stop } = initAccessibilityFlags(backend)
    await ready
    expect(getAccessibilityFlagsSnapshot().increaseContrast).toBe(false)
    // User turns Increase Contrast on while backgrounded; the flag updates only
    // after the app returns to the foreground re-queries it.
    setContrast(true)
    cbs.fg?.()
    await Promise.resolve()
    await Promise.resolve()
    expect(getAccessibilityFlagsSnapshot().increaseContrast).toBe(true)
    stop()
  })

  it('stop() removes every subscription and halts further updates', async () => {
    const { backend, cbs, removed } = makeBackend()
    const { ready, stop } = initAccessibilityFlags(backend)
    await ready
    stop()
    expect(removed).toEqual({ rm: true, dwc: true, fg: true })
    // A late event after stop() must not mutate the store.
    cbs.rm?.(true)
    expect(getAccessibilityFlagsSnapshot().reduceMotion).toBe(false)
  })

  it('keeps a stable snapshot reference when nothing changes', async () => {
    const { backend, cbs } = makeBackend({ rm: true })
    const { ready, stop } = initAccessibilityFlags(backend)
    await ready
    const before = getAccessibilityFlagsSnapshot()
    cbs.rm?.(true) // same value — no-op
    expect(getAccessibilityFlagsSnapshot()).toBe(before)
    stop()
  })
})
