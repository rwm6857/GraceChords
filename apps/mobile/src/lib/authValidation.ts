// Form validation for the auth screens. Pure functions — no React Native
// imports — so the vitest harness can exercise them headless.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const MIN_PASSWORD_LENGTH = 8

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim())
}

export function validateSignIn(input: { email: string; password: string }): string | null {
  if (!isValidEmail(input.email)) return 'Enter a valid email address.'
  if (!input.password) return 'Enter your password.'
  return null
}

export function validateSignUp(input: {
  fullName: string
  email: string
  password: string
}): string | null {
  if (!input.fullName.trim()) return 'Enter your full name.'
  if (!isValidEmail(input.email)) return 'Enter a valid email address.'
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  return null
}
