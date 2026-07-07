import { describe, expect, it, vi } from 'vitest'
import {
  isInvalidRefreshTokenError,
  resolveInitialSession,
  silenceInvalidRefreshTokenLogs,
} from '../authSession'

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

describe('silenceInvalidRefreshTokenLogs', () => {
  function fakeConsole() {
    return { error: vi.fn() as unknown as (...args: unknown[]) => void }
  }

  it('drops the benign invalid-refresh-token error', () => {
    const original = vi.fn()
    const target = { error: original as unknown as (...args: unknown[]) => void }
    silenceInvalidRefreshTokenLogs(target)

    target.error({
      __isAuthError: true,
      name: 'AuthApiError',
      status: 400,
      code: 'refresh_token_not_found',
      message: 'Invalid Refresh Token: Refresh Token Not Found',
    })

    expect(original).not.toHaveBeenCalled()
  })

  it('passes unrelated console.error calls through untouched', () => {
    const original = vi.fn()
    const target = { error: original as unknown as (...args: unknown[]) => void }
    silenceInvalidRefreshTokenLogs(target)

    target.error('a real problem', { detail: 1 })
    target.error(new Error('boom'))

    expect(original).toHaveBeenCalledTimes(2)
    expect(original).toHaveBeenNthCalledWith(1, 'a real problem', { detail: 1 })
  })

  it('suppresses when the error is passed alongside a message (auto-refresh tick shape)', () => {
    const original = vi.fn()
    const target = { error: original as unknown as (...args: unknown[]) => void }
    silenceInvalidRefreshTokenLogs(target)

    target.error('Auto refresh tick failed with error. This is likely a transient error.', {
      code: 'refresh_token_not_found',
    })

    expect(original).not.toHaveBeenCalled()
  })

  it('is idempotent: a second install does not double-wrap and its restore is a no-op', () => {
    const original = vi.fn() as unknown as (...args: unknown[]) => void
    const target = { error: original }
    silenceInvalidRefreshTokenLogs(target)
    const wrapped = target.error
    const restoreSecond = silenceInvalidRefreshTokenLogs(target)

    expect(target.error).toBe(wrapped)
    restoreSecond()
    // the no-op restore must not tear the filter off
    expect(target.error).toBe(wrapped)
  })

  it('restore puts the original console.error back', () => {
    const original = vi.fn() as unknown as (...args: unknown[]) => void
    const target = { error: original }
    const restore = silenceInvalidRefreshTokenLogs(target)

    expect(target.error).not.toBe(original)
    restore()
    expect(target.error).toBe(original)
  })

  it('defaults to the global console when no target is given', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const restore = silenceInvalidRefreshTokenLogs()
      console.error({ code: 'refresh_token_not_found' })
      expect(spy).not.toHaveBeenCalled()
      console.error('still works')
      expect(spy).toHaveBeenCalledWith('still works')
      restore()
    } finally {
      spy.mockRestore()
    }
  })

  it('leaves the passthrough available for callers that inject a stub', () => {
    const target = fakeConsole()
    const restore = silenceInvalidRefreshTokenLogs(target)
    restore()
    expect(typeof target.error).toBe('function')
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
