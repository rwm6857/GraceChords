import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetAuthLinkForTest,
  parseAuthLink,
  setPendingAuthLink,
  takePendingAuthLink,
} from '../authLink'

const RECOVERY = '/app/reset-password'
const CONFIRM = '/app/auth/callback'
// What GoTrue actually appends in the implicit flow.
const TOKENS = 'access_token=AT&expires_in=3600&refresh_token=RT&token_type=bearer'

describe('parseAuthLink', () => {
  it('reads a recovery link', () => {
    expect(parseAuthLink(`${RECOVERY}#${TOKENS}&type=recovery`)).toEqual({
      kind: 'recovery',
      accessToken: 'AT',
      refreshToken: 'RT',
    })
  })

  it('reads a sign-up confirmation link', () => {
    expect(parseAuthLink(`${CONFIRM}#${TOKENS}&type=signup`)).toEqual({
      kind: 'signup',
      accessToken: 'AT',
      refreshToken: 'RT',
    })
  })

  it('falls back to the path when the link carries no type', () => {
    expect(parseAuthLink(`${RECOVERY}#${TOKENS}`)?.kind).toBe('recovery')
    expect(parseAuthLink(`${CONFIRM}#${TOKENS}`)?.kind).toBe('signup')
  })

  it('reads an expired-link error out of the fragment', () => {
    const link = parseAuthLink(
      `${RECOVERY}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`,
    )
    expect(link).toEqual({
      kind: 'error',
      code: 'otp_expired',
      description: 'Email link is invalid or has expired',
    })
  })

  it('reads an error from the query string too — Supabase uses both', () => {
    expect(parseAuthLink(`${CONFIRM}?error=access_denied&error_code=otp_expired`)?.kind).toBe(
      'error',
    )
  })

  it('reports an auth path with no payload as an error, not as nothing', () => {
    // It arrived on a path only an auth email uses. Sending the user quietly to
    // Home would hide a real failure.
    expect(parseAuthLink(RECOVERY)).toEqual({ kind: 'error', code: null, description: null })
  })

  it('accepts the full https URL as well as a bare path', () => {
    expect(
      parseAuthLink(`https://gracechords.com${RECOVERY}#${TOKENS}&type=recovery`)?.kind,
    ).toBe('recovery')
  })

  it('ignores every other deep link, including the web app auth paths', () => {
    // /reset-password and /auth/callback belong to the BROWSER flows and are
    // deliberately unclaimed — web's signInWithOAuth redirects to the latter.
    expect(parseAuthLink('/reset-password#access_token=AT&refresh_token=RT')).toBeNull()
    expect(parseAuthLink('/auth/callback#access_token=AT&refresh_token=RT')).toBeNull()
    expect(parseAuthLink('/viewer/some-song')).toBeNull()
    expect(parseAuthLink('/setlist/import?ids=a,b')).toBeNull()
  })

  it('never throws on a malformed URL', () => {
    expect(parseAuthLink('%%%not a url%%%')).toBeNull()
    expect(parseAuthLink('')).toBeNull()
  })
})

describe('the pending auth link', () => {
  beforeEach(__resetAuthLinkForTest)

  it('is consumed once, so a re-mount cannot replay a spent token', () => {
    setPendingAuthLink({ kind: 'recovery', accessToken: 'AT', refreshToken: 'RT' })
    expect(takePendingAuthLink()).toEqual({
      kind: 'recovery',
      accessToken: 'AT',
      refreshToken: 'RT',
    })
    expect(takePendingAuthLink()).toBeNull()
  })

  it('is empty until a link arrives', () => {
    expect(takePendingAuthLink()).toBeNull()
  })
})
