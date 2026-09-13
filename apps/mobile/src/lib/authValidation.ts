// Form validation for the auth screens. Pure functions — no React Native or
// i18n imports — so the vitest harness can exercise them headless. Failures
// are returned as auth-namespace i18n KEYS (errors.*); the screen resolves them
// through `t`.
//
// The password policy itself lives in @gracechords/core so the requirement copy,
// this validator and the web app cannot drift apart — see passwordPolicy.ts.
import {
  MIN_PASSWORD_LENGTH,
  validatePasswordStrength,
} from '@gracechords/core'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export { MIN_PASSWORD_LENGTH, validatePasswordStrength }

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
  // Checks the FULL policy, not just length: the server enforces all four
  // character classes, so a length-only check here sends passwords out to fail
  // remotely and reports the failure in GoTrue's words rather than ours.
  return validatePasswordStrength(input.password)
}
