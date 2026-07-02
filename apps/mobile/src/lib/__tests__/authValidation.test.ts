import { describe, expect, it } from 'vitest'
import { isValidEmail, validateSignIn, validateSignUp } from '../authValidation'

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

describe('validateSignUp', () => {
  const valid = { fullName: 'Alex Brown', email: 'alex@example.com', password: 'longenough' }

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
    expect(validateSignUp({ ...valid, password: '1234567' })).toMatch(/8 characters/)
    expect(validateSignUp({ ...valid, password: '12345678' })).toBeNull()
  })
})
