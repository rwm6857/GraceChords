import { requireOptionalNativeModule } from 'expo'

// Wrapper over the local `DeclaredAgeRange` native module
// (apps/mobile/modules/declared-age-range), which calls Apple's iOS 26+ Declared
// Age Range API to check the age range the user's Family Sharing / Screen Time
// setup declares — real age assurance without collecting a birthdate.
//
// The module is optional: on Android, older iOS, or a Metro-only export bundle,
// `requireOptionalNativeModule` returns null and this resolves to 'unknown', so
// the caller falls back to self-declaration. A result of 'over_13' / 'under_13'
// is only ever returned when Apple confidently reports it against the 13 gate.

type DeclaredAgeRangeResult = 'over_13' | 'under_13' | 'unknown'

type NativeDeclaredAgeRange = {
  /** Ask Apple whether the user is above/below 13. Resolves 'unknown' if declined/unavailable. */
  requestAgeRange: () => Promise<DeclaredAgeRangeResult>
}

const Native = requireOptionalNativeModule<NativeDeclaredAgeRange>('DeclaredAgeRange')

/** True on platforms/OS versions where the Declared Age Range API is available. */
export function isDeclaredAgeRangeAvailable(): boolean {
  return Native != null
}

/**
 * Ask Apple's Declared Age Range API whether the user is 13+. Returns 'unknown'
 * (never throws) whenever the API is unavailable, declined, or withheld — the
 * caller then falls back to self-declaration.
 */
export async function requestDeclaredAgeRange(): Promise<DeclaredAgeRangeResult> {
  if (!Native) return 'unknown'
  try {
    return await Native.requestAgeRange()
  } catch {
    return 'unknown'
  }
}
