import { AccessibilityInfo, AppState, Platform } from 'react-native'
import {
  initAccessibilityFlags,
  type AccessibilityBackend,
  type FlagSubscription,
} from './accessibilityFlags'
import {
  addDifferentiateWithoutColorListener,
  getShouldDifferentiateWithoutColor,
} from './differentiateWithoutColor'

// The real RN backend for the accessibility-flags store. Kept separate from the
// pure store (accessibilityFlags.ts) so the store stays RN-free and unit-testable
// with an injected fake, mirroring the readerReminder / readerReminderService
// split.

// `isDarkerSystemColorsEnabled` maps to iOS "Increase Contrast". Access it
// defensively so a stale RN type definition can't break typecheck and Android
// (no equivalent setting) simply reports off.
const Info = AccessibilityInfo as typeof AccessibilityInfo & {
  isDarkerSystemColorsEnabled?: () => Promise<boolean>
}

const backend: AccessibilityBackend = {
  isReduceMotionEnabled: () => AccessibilityInfo.isReduceMotionEnabled(),
  isIncreaseContrastEnabled: () =>
    Platform.OS === 'ios' && typeof Info.isDarkerSystemColorsEnabled === 'function'
      ? Info.isDarkerSystemColorsEnabled()
      : Promise.resolve(false),
  isDifferentiateWithoutColorEnabled: () => getShouldDifferentiateWithoutColor(),
  onReduceMotionChanged: (cb) =>
    AccessibilityInfo.addEventListener('reduceMotionChanged', cb) as FlagSubscription,
  onDifferentiateWithoutColorChanged: (cb) => addDifferentiateWithoutColorListener(cb),
  onForeground: (cb) => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') cb()
    })
    return { remove: () => sub.remove() }
  },
}

/** Wire the accessibility-flags store to the OS. Call once at the app root. */
export function startAccessibilityFlags(): { ready: Promise<void>; stop: () => void } {
  return initAccessibilityFlags(backend)
}
