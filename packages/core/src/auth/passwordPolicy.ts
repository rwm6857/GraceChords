// The project's password policy — the single place it is written down.
//
// The policy itself lives in the Supabase dashboard (Authentication → Providers
// → Email) and is NOT machine-readable from this repo: there is no
// supabase/config.toml. As of 2026-09-12 it reads:
//
//   Minimum password length ... 8
//   Password requirements ..... lowercase, uppercase letters, digits and symbols
//
// Mirrored here so both apps can reject a bad password before a round trip, and
// so the requirement copy and the validator can never disagree. If the dashboard
// setting changes, change PASSWORD_POLICY with it and update the requirement
// string in auth.json. The server's own weak_password rejection is surfaced
// either way, so drift degrades to a slower error rather than a wrong one.

/** GoTrue's default symbol set for the "symbols" requirement. */
export const PASSWORD_SYMBOLS = "!@#$%^&*()_+-=[]{};'\\:\"|<>?,./"

export const PASSWORD_POLICY = {
  minLength: 8,
  requireLower: true,
  requireUpper: true,
  requireDigit: true,
  requireSymbol: true,
} as const

/** Back-compat alias for callers that only need the length. */
export const MIN_PASSWORD_LENGTH = PASSWORD_POLICY.minLength

export type PasswordChecks = {
  minLength: boolean
  hasLower: boolean
  hasUpper: boolean
  hasDigit: boolean
  hasSymbol: boolean
}

// Matched by membership rather than a character class so none of these need
// regex escaping.
function hasSymbol(password: string): boolean {
  for (const ch of password) {
    if (PASSWORD_SYMBOLS.includes(ch)) return true
  }
  return false
}

/** Per-rule pass/fail, for a UI that wants to show each requirement separately. */
export function checkPassword(password: string): PasswordChecks {
  const pw = password || ''
  return {
    minLength: pw.length >= PASSWORD_POLICY.minLength,
    hasLower: /[a-z]/.test(pw),
    hasUpper: /[A-Z]/.test(pw),
    hasDigit: /[0-9]/.test(pw),
    hasSymbol: hasSymbol(pw),
  }
}

/**
 * Check a NEW password against the policy. Returns an auth-namespace i18n key,
 * or null when it passes.
 *
 * Length is reported separately from composition because "too short" is the one
 * failure a user can fix without re-reading the whole rule.
 */
export function validatePasswordStrength(password: string): string | null {
  const checks = checkPassword(password)
  if (!checks.minLength) return 'errors.passwordTooShort'
  if (PASSWORD_POLICY.requireLower && !checks.hasLower) return 'errors.passwordNeedsMix'
  if (PASSWORD_POLICY.requireUpper && !checks.hasUpper) return 'errors.passwordNeedsMix'
  if (PASSWORD_POLICY.requireDigit && !checks.hasDigit) return 'errors.passwordNeedsMix'
  if (PASSWORD_POLICY.requireSymbol && !checks.hasSymbol) return 'errors.passwordNeedsMix'
  return null
}
