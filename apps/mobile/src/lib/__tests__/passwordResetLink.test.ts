import { describe, expect, it } from 'vitest'
import { passwordResetRedirectUrl, signUpConfirmRedirectUrl } from '../passwordResetLink'

// The reset link used to point at the web page (/reset-password) because the app
// had no set-password route. It now points at /app/reset-password, which the app
// CLAIMS as a Universal Link / App Link, so the link opens the app on a device
// that has it and still serves the web page everywhere else.
//
// The /app/ prefix is not decoration: web's own /reset-password and
// /auth/callback are the targets of browser-initiated flows — signInWithOAuth
// redirects to the latter — so claiming those would pull a browser sign-in into
// the app mid-handshake. See apps/web/public/.well-known/README.md.

describe('passwordResetRedirectUrl', () => {
  it('points at the path the app claims, not the web reset page', () => {
    expect(passwordResetRedirectUrl('https://gracechords.com')).toBe(
      'https://gracechords.com/app/reset-password',
    )
  })

  it('tolerates a trailing slash', () => {
    expect(passwordResetRedirectUrl('https://gracechords.com/')).toBe(
      'https://gracechords.com/app/reset-password',
    )
  })

  // apiBase() throws when the env var is missing. This must not: a misconfigured
  // build should still send a link to the production site.
  it('falls back to production rather than throwing when unset', () => {
    expect(passwordResetRedirectUrl(undefined)).toBe('https://gracechords.com/app/reset-password')
    expect(passwordResetRedirectUrl('')).toBe('https://gracechords.com/app/reset-password')
  })
})

describe('signUpConfirmRedirectUrl', () => {
  it('points at the confirmation path the app claims', () => {
    expect(signUpConfirmRedirectUrl('https://gracechords.com')).toBe(
      'https://gracechords.com/app/auth/callback',
    )
  })

  it('falls back to production too — a confirmation link must never be dead', () => {
    expect(signUpConfirmRedirectUrl(undefined)).toBe('https://gracechords.com/app/auth/callback')
  })

  it('is a DIFFERENT path from the web OAuth callback', () => {
    expect(signUpConfirmRedirectUrl('https://gracechords.com')).not.toBe(
      'https://gracechords.com/auth/callback',
    )
  })
})
