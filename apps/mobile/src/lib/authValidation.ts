// Form validation for the auth screens. Pure functions — no React Native or
// i18n imports — so the vitest harness can exercise them headless. Failures
// are returned as auth-namespace i18n KEYS (errors.*); the screen resolves
// them through `t` (raw non-key messages pass through via defaultValue).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const MIN_PASSWORD_LENGTH = 8

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
