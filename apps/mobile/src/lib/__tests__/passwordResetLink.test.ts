import { describe, expect, it } from 'vitest'
import { passwordResetRedirectUrl } from '../passwordResetLink'

describe('passwordResetRedirectUrl', () => {
  it('points at the web reset page', () => {
    expect(passwordResetRedirectUrl('https://gracechords.com')).toBe(
      'https://gracechords.com/reset-password',
    )
  })

  it('tolerates a trailing slash', () => {
    expect(passwordResetRedirectUrl('https://gracechords.com/')).toBe(
      'https://gracechords.com/reset-password',
    )
  })

  // apiBase() throws when the env var is missing. This must not: a misconfigured
  // build should still send a link to the production site.
  it('falls back to production rather than throwing when unset', () => {
    expect(passwordResetRedirectUrl(undefined)).toBe('https://gracechords.com/reset-password')
    expect(passwordResetRedirectUrl('')).toBe('https://gracechords.com/reset-password')
  })
})
