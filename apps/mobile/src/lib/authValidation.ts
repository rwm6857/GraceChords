// Form validation for the auth screens. Pure functions — no React Native or
// i18n imports — so the vitest harness can exercise them headless. Failures
// are returned as auth-namespace i18n KEYS (errors.*); the screen resolves
// them through `t` (raw non-key messages pass through via defaultValue).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const MIN_PASSWORD_LENGTH = 8

// The project's password policy lives in the Supabase dashboard (Authentication
// → Providers → Email) and is NOT machine-readable from this repo — there is no
// supabase/config.toml. As of 2026-08-07 it reads:
//
//   Minimum password length ... 8
//   Password requirements ..... lowercase, uppercase letters, digits and symbols
//
// Mirrored below so the change-password form can reject a bad password before a
// round trip. If the dashboard setting changes, change this with it. The server's
// own weak_password rejection is surfaced inline regardless, so drift degrades to
// a slower error rather than a wrong one.
//
// GoTrue's default symbol set for that policy. Matched by membership rather than
// a character class so none of these need regex escaping.
const PASSWORD_SYMBOLS = "!@#$%^&*()_+-=[]{};'\\:\"|<>?,./"

function hasSymbol(password: string): boolean {
  for (const ch of password) {
    if (PASSWORD_SYMBOLS.includes(ch)) return true
  }
  return false
}

/**
 * Check a NEW password against the configured policy. Returns an auth-namespace
 * i18n key, or null when it passes.
 *
 * Deliberately not wired into validateSignUp — that path only checks length
 * today, so signup can still fail server-side against this policy. Left as-is on
 * purpose; see the PR description.
 */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return 'errors.passwordTooShort'
  if (!/[a-z]/.test(password)) return 'errors.passwordNeedsMix'
  if (!/[A-Z]/.test(password)) return 'errors.passwordNeedsMix'
  if (!/[0-9]/.test(password)) return 'errors.passwordNeedsMix'
  if (!hasSymbol(password)) return 'errors.passwordNeedsMix'
  return null
}

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim())
}

export function validateSignIn(input: { email: string; password: string }): string | null {
  if (!isValidEmail(input.email)) return 'errors.invalidEmail'
  if (!input.password) return 'errors.passwordRequired'
  return null
}

export function validateSignUp(input: {
  fullName: string
  email: string
  password: string
}): string | null {
  if (!input.fullName.trim()) return 'errors.fullNameRequired'
  if (!isValidEmail(input.email)) return 'errors.invalidEmail'
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return 'errors.passwordTooShort'
  }
  return null
}
