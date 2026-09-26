import { describe, expect, it, vi } from 'vitest'
import {
  isInvalidRefreshTokenError,
  keepSessionOnTransientRefreshFailure,
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

  // The launch path this bounds: getSession() refreshes over the network when the
  // access token is near expiry, and a hanging (rather than refusing) network leaves
  // it pending for as long as URLSession allows — with the native splash still up.
  it('resolves null once the timeout elapses if getSession never settles', async () => {
    const auth = fakeAuth({ getSession: vi.fn().mockReturnValue(new Promise(() => {})) })

    await expect(resolveInitialSession(auth, 5)).resolves.toBeNull()
  })

  it('prefers a fast resolve over the timeout', async () => {
    const session = { user: { id: 'u1' } }
    const auth = fakeAuth({
      getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
    })

    await expect(resolveInitialSession(auth, 5000)).resolves.toBe(session)
  })

  // A rejection here would be a member of the hydration Promise.all rejecting, which
  // leaves `ready` false and the splash up forever.
  it('resolves null instead of rejecting when getSession throws', async () => {
    const auth = fakeAuth({
      getSession: vi.fn().mockRejectedValue(new Error('navigator lock timeout')),
    })

    await expect(resolveInitialSession(auth)).resolves.toBeNull()
    expect(auth.signOut).not.toHaveBeenCalled()
  })
})

// The offline-logout regression (reported by users opening the app with no
// service): a session that cannot be VERIFIED is not a session that is gone.
describe('resolveInitialSession — offline fallback', () => {
  const stored = { user: { id: 'u1' }, access_token: 'a', refresh_token: 'r' }

  it('adopts the stored session when the refresh fails on a dead network', async () => {
    const auth = fakeAuth({
      getSession: vi.fn().mockResolvedValue({
        data: { session: null },
        error: { message: 'Network request failed' },
      }),
    })
    const read = vi.fn().mockResolvedValue(stored)

    await expect(resolveInitialSession(auth, 5000, read)).resolves.toBe(stored)
    // Critically: it must NOT purge the session it could not verify.
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it('adopts the stored session when the boot read times out', async () => {
    const auth = fakeAuth({
      getSession: vi.fn().mockImplementation(() => new Promise(() => {})),
    })
    const read = vi.fn().mockResolvedValue(stored)

    await expect(resolveInitialSession(auth, 5, read)).resolves.toBe(stored)
  })

  it('still reports signed out when the token is DEAD, not merely unverifiable', async () => {
    const auth = fakeAuth({
      getSession: vi.fn().mockResolvedValue({
        data: { session: null },
        error: { code: 'refresh_token_not_found' },
      }),
    })
    const read = vi.fn().mockResolvedValue(stored)

    await expect(resolveInitialSession(auth, 5000, read)).resolves.toBeNull()
    expect(auth.signOut).toHaveBeenCalled()
    // The fallback must never resurrect a session the server already rejected.
    expect(read).not.toHaveBeenCalled()
  })

  it('reports signed out when storage is genuinely empty', async () => {
    const auth = fakeAuth({
      getSession: vi.fn().mockResolvedValue({
        data: { session: null },
        error: { message: 'Network request failed' },
      }),
    })
    await expect(
      resolveInitialSession(auth, 5000, vi.fn().mockResolvedValue(null)),
    ).resolves.toBeNull()
  })

  it('ignores a stored session with no refresh token — it could never be revived', async () => {
    const auth = fakeAuth({
      getSession: vi.fn().mockResolvedValue({
        data: { session: null },
        error: { message: 'Network request failed' },
      }),
    })
    const read = vi.fn().mockResolvedValue({ user: { id: 'u1' }, access_token: 'a' })
    await expect(resolveInitialSession(auth, 5000, read)).resolves.toBeNull()
  })

  it('does not fall back when there is no error — that really is signed out', async () => {
    const auth = fakeAuth()
    const read = vi.fn().mockResolvedValue(stored)
    await expect(resolveInitialSession(auth, 5000, read)).resolves.toBeNull()
    expect(read).not.toHaveBeenCalled()
  })

  it('survives a throwing storage reader', async () => {
    const auth = fakeAuth({
      getSession: vi.fn().mockResolvedValue({
        data: { session: null },
        error: { message: 'Network request failed' },
      }),
    })
    const read = vi.fn().mockRejectedValue(new Error('storage exploded'))
    await expect(resolveInitialSession(auth, 5000, read)).resolves.toBeNull()
  })
})

describe('keepSessionOnTransientRefreshFailure', () => {
  const REFRESH = 'https://ref.supabase.co/auth/v1/token?grant_type=refresh_token'

  function respond(status: number, body: string, type = 'application/json') {
    return vi.fn().mockResolvedValue(new Response(body, { status, headers: { 'content-type': type } }))
  }

  it('passes GoTrue rejections of the token through, so a dead session still ends', async () => {
    const onFailure = vi.fn()
    const dead = JSON.stringify({
      code: 'refresh_token_not_found',
      message: 'Invalid Refresh Token: Refresh Token Not Found',
    })
    const res = await keepSessionOnTransientRefreshFailure(respond(400, dead), onFailure)(REFRESH)
    expect(res.status).toBe(400)
    // The body is still readable by auth-js after we peeked at it.
    expect(await res.json()).toMatchObject({ code: 'refresh_token_not_found' })
    expect(onFailure).toHaveBeenCalledWith({
      status: 400,
      code: 'refresh_token_not_found',
      message: 'Invalid Refresh Token: Refresh Token Not Found',
      keptSession: false,
    })
  })

  it('recognises the legacy error_code and OAuth error shapes', async () => {
    const legacy = JSON.stringify({ code: 400, error_code: 'refresh_token_already_used', msg: 'x' })
    const oauth = JSON.stringify({ error: 'invalid_grant', error_description: 'x' })
    await expect(keepSessionOnTransientRefreshFailure(respond(400, legacy))(REFRESH)).resolves.toBeInstanceOf(Response)
    await expect(keepSessionOnTransientRefreshFailure(respond(400, oauth))(REFRESH)).resolves.toBeInstanceOf(Response)
  })

  it.each([
    ['a GoTrue 500', 500, JSON.stringify({ code: 'unexpected_failure', message: 'db' })],
    ['a rate limit', 429, JSON.stringify({ code: 'over_request_rate_limit', message: 'slow down' })],
    ['a non-JSON block page', 403, '<html>Blocked by your network</html>'],
    ['a gateway error without a GoTrue body', 401, JSON.stringify({ message: 'Unauthorized' })],
  ])('throws on %s so auth-js keeps the session and retries', async (_label, status, body) => {
    const onFailure = vi.fn()
    const wrapped = keepSessionOnTransientRefreshFailure(respond(status, body), onFailure)
    await expect(wrapped(REFRESH)).rejects.toThrow(/keeping the session/)
    expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ status, keptSession: true }))
  })

  it('leaves successful refreshes and every other request alone', async () => {
    const onFailure = vi.fn()
    const ok = await keepSessionOnTransientRefreshFailure(respond(200, '{}'), onFailure)(REFRESH)
    expect(ok.status).toBe(200)
    const other = await keepSessionOnTransientRefreshFailure(respond(500, '<html/>'), onFailure)(
      'https://ref.supabase.co/rest/v1/songs',
    )
    expect(other.status).toBe(500)
    expect(onFailure).not.toHaveBeenCalled()
  })
})
