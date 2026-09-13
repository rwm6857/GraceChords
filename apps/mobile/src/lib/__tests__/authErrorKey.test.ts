import { describe, expect, it } from 'vitest'
import { authErrorKey } from '@gracechords/core'

// The contract this file exists to defend (QA Nº 6994, M-02): authErrorKey
// ALWAYS returns an i18n key, so no provider wording can reach a user.

describe('authErrorKey', () => {
  it('maps the weak-password codes the sign-up screen used to leak', () => {
    expect(authErrorKey({ code: 'weak_password', message: 'Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789.' })).toBe('errors.passwordNeedsMix')
    expect(authErrorKey({ code: 'password_required_characters' })).toBe('errors.passwordNeedsMix')
  })

  it('maps sign-in failures', () => {
    expect(authErrorKey({ code: 'invalid_credentials' })).toBe('errors.invalidCredentials')
    expect(authErrorKey({ code: 'invalid_grant' })).toBe('errors.invalidCredentials')
    expect(authErrorKey({ code: 'email_not_confirmed' })).toBe('errors.emailNotConfirmed')
  })

  it('maps sign-up and email failures', () => {
    expect(authErrorKey({ code: 'email_exists' })).toBe('errors.emailExists')
    expect(authErrorKey({ code: 'user_already_exists' })).toBe('errors.emailExists')
    expect(authErrorKey({ code: 'invalid_email' })).toBe('errors.invalidEmail')
  })

  it('maps every throttle shape to one key', () => {
    expect(authErrorKey({ status: 429 })).toBe('errors.rateLimited')
    expect(authErrorKey({ code: 'over_email_send_rate_limit' })).toBe('errors.rateLimited')
    expect(authErrorKey({ code: 'over_request_rate_limit' })).toBe('errors.rateLimited')
  })

  it('maps React Native\'s bare network TypeError', () => {
    expect(authErrorKey({ message: 'Network request failed' })).toBe('errors.network')
    expect(authErrorKey(new TypeError('Network request failed'))).toBe('errors.network')
  })

  it('prefers network over a status that came with it', () => {
    expect(authErrorKey({ status: 429, message: 'Network request failed' })).toBe('errors.network')
  })

  it('falls back to messages when the response carries no code', () => {
    expect(authErrorKey({ message: 'Invalid login credentials' })).toBe('errors.invalidCredentials')
    expect(authErrorKey({ message: 'Email not confirmed' })).toBe('errors.emailNotConfirmed')
    expect(authErrorKey({ message: 'User already registered' })).toBe('errors.emailExists')
  })

  it('returns a key — never the message — for anything unrecognised', () => {
    const exotic = { code: 'some_future_gotrue_code', message: 'Something internal and raw' }
    expect(authErrorKey(exotic)).toBe('errors.generic')
    expect(authErrorKey(null)).toBe('errors.generic')
    expect(authErrorKey(undefined)).toBe('errors.generic')
    expect(authErrorKey({})).toBe('errors.generic')
  })

  it('never returns a value that is not an errors.* key', () => {
    const samples: unknown[] = [
      null,
      undefined,
      {},
      { message: 'raw text' },
      { code: 'weak_password' },
      { status: 429 },
      { code: 'unknown', message: 'column users.foo does not exist' },
    ]
    for (const sample of samples) {
      expect(authErrorKey(sample as never)).toMatch(/^errors\.[a-zA-Z]+$/)
    }
  })
})
