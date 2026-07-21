import { useSyncExternalStore } from 'react'

// Live OS accessibility settings the app reacts to. The guiding rule: on a
// device with default settings every flag is `false`, so the app behaves exactly
// as it did before — enhanced behavior engages ONLY when the matching system
// setting is turned on (iOS Reduce Motion / Increase Contrast / Differentiate
// Without Color; the first two map to Android equivalents, the third is iOS-only).
//
// Like defaults.ts this is a module store read through useSyncExternalStore, but
// its source is the OS (via an INJECTED backend) rather than AsyncStorage — so it
// stays RN-free and unit-testable headless. The app root calls the service
// wrapper (accessibilityFlagsService.ts) once, awaiting `ready` during the splash
// hold so the first paint already reflects any enabled setting (no flash), and
// keeps `stop` for cleanup.

export type AccessibilityFlags = {
  /** iOS Reduce Motion / Android "Remove animations". */
  reduceMotion: boolean
  /** iOS Increase Contrast (darker system colors). Android has no equivalent. */
  increaseContrast: boolean
  /** iOS Differentiate Without Color. iOS-only (no Android/JS equivalent). */
  differentiateWithoutColor: boolean
}

export const DEFAULT_ACCESSIBILITY_FLAGS: AccessibilityFlags = {
  reduceMotion: false,
  increaseContrast: false,
  differentiateWithoutColor: false,
}

/** A removable subscription — matches RN's EmitterSubscription shape. */
export type FlagSubscription = { remove: () => void }

/**
 * The OS-facing surface the store depends on, injected so the store is testable.
 * `increaseContrast` has no native change event, so it is re-queried whenever
 * `onForeground` fires (app returns to the foreground).
 */
export type AccessibilityBackend = {
  isReduceMotionEnabled: () => Promise<boolean>
  isIncreaseContrastEnabled: () => Promise<boolean>
  isDifferentiateWithoutColorEnabled: () => Promise<boolean>
  onReduceMotionChanged: (cb: (value: boolean) => void) => FlagSubscription
  onDifferentiateWithoutColorChanged: (cb: (value: boolean) => void) => FlagSubscription
  onForeground: (cb: () => void) => FlagSubscription
}

// Replaced with a NEW object on every real change so getSnapshot returns a stable
// reference between changes (required by useSyncExternalStore).
let cache: AccessibilityFlags = DEFAULT_ACCESSIBILITY_FLAGS
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function patch(next: Partial<AccessibilityFlags>): void {
  let changed = false
  const merged = { ...cache }
  for (const key of Object.keys(next) as (keyof AccessibilityFlags)[]) {
    const value = next[key]
    if (value !== undefined && merged[key] !== value) {
      merged[key] = value
      changed = true
    }
  }
  if (!changed) return
  cache = merged
  emit()
}

/** Synchronous read of the current flags (safe before init — returns all-false). */
export function getAccessibilityFlagsSnapshot(): AccessibilityFlags {
  return cache
}

/** Test seam: drive the store directly without a backend. */
export function __setAccessibilityFlagsForTest(next: Partial<AccessibilityFlags>): void {
  patch(next)
}

/** Test seam: reset the store to defaults between tests. */
export function __resetAccessibilityFlagsForTest(): void {
  cache = DEFAULT_ACCESSIBILITY_FLAGS
  emit()
}

/**
 * Seed the store from the backend, subscribe to change events, and re-query the
 * contrast flag on foreground. Returns `ready` (resolves once the initial query
 * settles — await it during the splash hold) and `stop` (removes every
 * subscription). The backend is injected to keep this module RN-free.
 */
export function initAccessibilityFlags(backend: AccessibilityBackend): {
  ready: Promise<void>
  stop: () => void
} {
  let alive = true

  const ready = Promise.all([
    backend.isReduceMotionEnabled().catch(() => false),
    backend.isIncreaseContrastEnabled().catch(() => false),
    backend.isDifferentiateWithoutColorEnabled().catch(() => false),
  ]).then(([reduceMotion, increaseContrast, differentiateWithoutColor]) => {
    if (alive) patch({ reduceMotion, increaseContrast, differentiateWithoutColor })
  })

  const subs: FlagSubscription[] = [
    backend.onReduceMotionChanged((value) => {
      if (alive) patch({ reduceMotion: value })
    }),
    backend.onDifferentiateWithoutColorChanged((value) => {
      if (alive) patch({ differentiateWithoutColor: value })
    }),
    backend.onForeground(() => {
      backend
        .isIncreaseContrastEnabled()
        .then((value) => {
          if (alive) patch({ increaseContrast: value })
        })
        .catch(() => {})
    }),
  ]

  return {
    ready,
    stop: () => {
      alive = false
      for (const sub of subs) sub.remove()
    },
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Subscribing hook — re-renders when any OS accessibility flag changes. */
export function useAccessibilityFlags(): AccessibilityFlags {
  return useSyncExternalStore(subscribe, getAccessibilityFlagsSnapshot, getAccessibilityFlagsSnapshot)
}
