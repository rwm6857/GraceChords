import { describe, expect, it } from 'vitest'
import {
  isValidEmail,
  validatePasswordStrength,
  validateSignIn,
  validateSignUp,
} from '../authValidation'

describe('isValidEmail', () => {
  it('accepts a normal address', () => {
    expect(isValidEmail('alex@example.com')).toBe(true)
  })

  it('trims surrounding whitespace', () => {
    expect(isValidEmail('  alex@example.com  ')).toBe(true)
  })

  it('rejects missing domain, missing @, and inner spaces', () => {
    expect(isValidEmail('alex@')).toBe(false)
    expect(isValidEmail('alex.example.com')).toBe(false)
    expect(isValidEmail('a lex@example.com')).toBe(false)
    expect(isValidEmail('alex@example')).toBe(false)
    expect(isValidEmail('')).toBe(false)
  })
})

describe('validateSignIn', () => {
  it('returns null for a valid form', () => {
    expect(validateSignIn({ email: 'alex@example.com', password: 'pw' })).toBeNull()
  })

  it('rejects an invalid email', () => {
    expect(validateSignIn({ email: 'nope', password: 'pw' })).toMatch(/email/i)
  })

  it('rejects an empty password', () => {
    expect(validateSignIn({ email: 'alex@example.com', password: '' })).toMatch(/password/i)
  })
})

describe('validatePasswordStrength', () => {
  it('accepts a password meeting every rule', () => {
    expect(validatePasswordStrength('Grace123!')).toBeNull()
  })

  it('reports length separately from composition', () => {
    expect(validatePasswordStrength('Gr1!')).toBe('errors.passwordTooShort')
  })

  it('rejects each missing character class', () => {
    expect(validatePasswordStrength('GRACE123!')).toBe('errors.passwordNeedsMix')
    expect(validatePasswordStrength('grace123!')).toBe('errors.passwordNeedsMix')
    expect(validatePasswordStrength('GraceChords!')).toBe('errors.passwordNeedsMix')
    expect(validatePasswordStrength('GraceChords1')).toBe('errors.passwordNeedsMix')
  })
})

describe('validateSignUp', () => {
  const valid = { fullName: 'Alex Brown', email: 'alex@example.com', password: 'Grace123!' }

  it('returns null for a valid form', () => {
    expect(validateSignUp(valid)).toBeNull()
  })

  it('rejects an empty or whitespace-only name', () => {
    expect(validateSignUp({ ...valid, fullName: '' })).toMatch(/name/i)
    expect(validateSignUp({ ...valid, fullName: '   ' })).toMatch(/name/i)
  })

  it('rejects an invalid email', () => {
    expect(validateSignUp({ ...valid, email: 'nope' })).toMatch(/email/i)
  })

  it('rejects passwords shorter than 8 characters', () => {
    expect(validateSignUp({ ...valid, password: 'Gr1!' })).toBe('errors.passwordTooShort')
  })

  // The regression behind QA Nº 6994 M-02: sign-up used to check length ONLY,
  // so a long-but-weak password passed here and failed server-side, and GoTrue's
  // own wording was what the user read.
  it('enforces the full policy, not just length', () => {
    expect(validateSignUp({ ...valid, password: 'longenough' })).toBe('errors.passwordNeedsMix')
    expect(validateSignUp({ ...valid, password: '12345678' })).toBe('errors.passwordNeedsMix')
  })
})
