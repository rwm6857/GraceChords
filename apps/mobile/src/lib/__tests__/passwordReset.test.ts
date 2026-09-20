import { describe, expect, it, vi } from 'vitest'
import { adoptAuthLinkSession, completePasswordReset } from '../passwordReset'
import { validatePasswordReset } from '../authValidation'
import {
  passwordResetRedirectUrl,
  signUpConfirmRedirectUrl,
  PASSWORD_RESET_PATH,
  SIGNUP_CONFIRM_PATH,
} from '../passwordResetLink'

// Mirrors the helper in authFlows.test.ts: a typed stub, so a call-site
// assertion below reads the mock without casting at every use.
type SupabaseAuth = Parameters<typeof completePasswordReset>[0]
type Stub = SupabaseAuth & { auth: Record<string, ReturnType<typeof vi.fn>> }

function fakeAuth(overrides: Record<string, unknown> = {}): Stub {
  return {
    auth: {
      setSession: vi.fn().mockResolvedValue({ data: {}, error: null }),
      updateUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
      ...overrides,
    },
  } as unknown as Stub
}

describe('adoptAuthLinkSession', () => {
  it('turns a recovery link into a live session', async () => {
    const supabase = fakeAuth()
    const result = await adoptAuthLinkSession(supabase, {
      kind: 'recovery',
      accessToken: 'AT',
      refreshToken: 'RT',
    })
    expect(result).toEqual({ ok: true })
    expect(supabase.auth.setSession).toHaveBeenCalledWith({
      access_token: 'AT',
      refresh_token: 'RT',
    })
  })

  it('signs a new user in straight from their confirmation link', async () => {
    const result = await adoptAuthLinkSession(fakeAuth(), {
      kind: 'signup',
      accessToken: 'AT',
      refreshToken: 'RT',
    })
    expect(result).toEqual({ ok: true })
  })

  it('reports a parse-time error link as expired, without calling Supabase', async () => {
    const supabase = fakeAuth()
    const result = await adoptAuthLinkSession(supabase, {
      kind: 'error',
      code: 'otp_expired',
      description: 'expired',
    })
    expect(result).toEqual({ ok: false, error: 'errors.authLinkExpired' })
    expect(supabase.auth.setSession).not.toHaveBeenCalled()
  })

  it('reports a token GoTrue rejects as expired too — replay lands here, not at parse', async () => {
    const supabase = fakeAuth({
      setSession: vi.fn().mockResolvedValue({ data: {}, error: { message: 'Token has expired' } }),
    })
    const result = await adoptAuthLinkSession(supabase, {
      kind: 'recovery',
      accessToken: 'AT',
      refreshToken: 'RT',
    })
    expect(result).toEqual({ ok: false, error: 'errors.authLinkExpired' })
  })
})

describe('completePasswordReset', () => {
  it('sets the new password', async () => {
    const supabase = fakeAuth()
    const result = await completePasswordReset(supabase, { password: 'Str0ng!pass' })
    expect(result).toEqual({ ok: true })
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({
      password: 'Str0ng!pass',
    })
  })

  it('maps a server rejection to an i18n key, never GoTrue wording', async () => {
    const supabase = fakeAuth({
      updateUser: vi.fn().mockResolvedValue({ data: {}, error: { code: 'weak_password' } }),
    })
    const result = await completePasswordReset(supabase, { password: 'short' })
    expect(result.ok).toBe(false)
    expect(result.error).toBe('errors.passwordNeedsMix')
  })
})

describe('validatePasswordReset', () => {
  it('requires the full strength policy, not just a length', () => {
    expect(validatePasswordReset({ password: 'alllowercase', confirmPassword: 'alllowercase' }))
      .toBeTruthy()
  })

  it('requires the two fields to match', () => {
    expect(
      validatePasswordReset({ password: 'Str0ng!pass', confirmPassword: 'Str0ng!pasz' }),
    ).toBe('errors.passwordMismatch')
  })

  it('accepts a strong, matching pair', () => {
    expect(validatePasswordReset({ password: 'Str0ng!pass', confirmPassword: 'Str0ng!pass' }))
      .toBeNull()
  })
})

describe('the auth email redirect URLs', () => {
  it('point at the two paths the app claims, not the web app’s own', () => {
    // Claiming web's /reset-password and /auth/callback would pull a browser
    // sign-in into the app mid-handshake — web's signInWithOAuth redirects to
    // the latter. See apps/web/public/.well-known/README.md.
    expect(PASSWORD_RESET_PATH).toBe('/app/reset-password')
    expect(SIGNUP_CONFIRM_PATH).toBe('/app/auth/callback')
  })

  it('build absolute URLs on the configured origin', () => {
    expect(passwordResetRedirectUrl('https://staging.example.com')).toBe(
      'https://staging.example.com/app/reset-password',
    )
    expect(signUpConfirmRedirectUrl('https://staging.example.com/')).toBe(
      'https://staging.example.com/app/auth/callback',
    )
  })

  it('falls back to the production site when the base is unset', () => {
    // A misconfigured build must still send a WORKING link rather than crash.
    expect(passwordResetRedirectUrl(undefined)).toBe('https://gracechords.com/app/reset-password')
  })
})
