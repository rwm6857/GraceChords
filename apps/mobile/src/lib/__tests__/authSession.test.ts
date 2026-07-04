import { describe, expect, it, vi } from 'vitest'
import { isInvalidRefreshTokenError, resolveInitialSession } from '../authSession'

type BootAuth = Parameters<typeof resolveInitialSession>[0]

function fakeAuth(overrides: Partial<BootAuth> = {}): BootAuth {
  return {
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  } as unknown as BootAuth
}

describe('isInvalidRefreshTokenError', () => {
  it('matches the refresh_token_not_found error code', () => {
    expect(
      isInvalidRefreshTokenError({
        code: 'refresh_token_not_found',
        message: 'Invalid Refresh Token: Refresh Token Not Found',
      }),
    ).toBe(true)
  })

  it('matches by message when only the message is present', () => {
    expect(
      isInvalidRefreshTokenError({ message: 'Invalid Refresh Token: Refresh Token Not Found' }),
    ).toBe(true)
    expect(isInvalidRefreshTokenError({ message: 'invalid refresh token' })).toBe(true)
  })

  it('ignores unrelated errors and non-objects', () => {
    expect(isInvalidRefreshTokenError({ code: 'over_email_send_rate_limit' })).toBe(false)
    expect(isInvalidRefreshTokenError({ message: 'Network request failed' })).toBe(false)
    expect(isInvalidRefreshTokenError(null)).toBe(false)
    expect(isInvalidRefreshTokenError('boom')).toBe(false)
    expect(isInvalidRefreshTokenError(undefined)).toBe(false)
  })
})

describe('resolveInitialSession', () => {
  it('returns the persisted session and never signs out', async () => {
    const session = { user: { id: 'u1' } }
    const auth = fakeAuth({
      getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
    })

    await expect(resolveInitialSession(auth)).resolves.toBe(session)
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it('returns null with no session and no error (signed out / fresh install)', async () => {
    const auth = fakeAuth()
    await expect(resolveInitialSession(auth)).resolves.toBeNull()
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it('purges the stale token locally and resolves null on a dead refresh token', async () => {
    const auth = fakeAuth({
      getSession: vi.fn().mockResolvedValue({
        data: { session: null },
        error: { code: 'refresh_token_not_found', message: 'Refresh Token Not Found' },
      }),
    })

    await expect(resolveInitialSession(auth)).resolves.toBeNull()
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('does not sign out on unrelated getSession errors', async () => {
    const auth = fakeAuth({
      getSession: vi.fn().mockResolvedValue({
        data: { session: null },
        error: { message: 'Network request failed' },
      }),
    })

    await expect(resolveInitialSession(auth)).resolves.toBeNull()
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it('still resolves null even if the local sign-out itself fails', async () => {
    const auth = fakeAuth({
      getSession: vi.fn().mockResolvedValue({
        data: { session: null },
        error: { code: 'refresh_token_not_found' },
      }),
      signOut: vi.fn().mockRejectedValue(new Error('storage unavailable')),
    })

    await expect(resolveInitialSession(auth)).resolves.toBeNull()
  })
})
