import { describe, expect, it, vi } from 'vitest'
import {
  authErrorKey,
  canUnlink,
  findIdentity,
  hasPassword,
  identityEmail,
  requestReauthentication,
  setPassword,
} from '@gracechords/core'

type Auth = Parameters<typeof setPassword>[0]

const GOOD = 'NewPassw0rd!'

function fakeSupabase(overrides: Record<string, unknown> = {}): Auth {
  return {
    auth: {
      updateUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      reauthenticate: vi.fn().mockResolvedValue({ data: {}, error: null }),
      ...overrides,
    },
  } as unknown as Auth
}

describe('setPassword', () => {
  it('rejects a mismatch before touching the server', async () => {
    const sb = fakeSupabase()
    const res = await setPassword(sb, { newPassword: GOOD, confirmPassword: 'Other1!x' })
    expect(res).toEqual({ ok: false, error: 'errors.passwordMismatch' })
    expect(sb.auth.updateUser).not.toHaveBeenCalled()
  })

  it('enforces the full password policy', async () => {
    const sb = fakeSupabase()
    const res = await setPassword(sb, { newPassword: 'password1', confirmPassword: 'password1' })
    expect(res).toEqual({ ok: false, error: 'errors.passwordNeedsMix' })
    expect(sb.auth.updateUser).not.toHaveBeenCalled()
  })

  it('sets the password, flags it in metadata, and signs other sessions out', async () => {
    const sb = fakeSupabase()
    const res = await setPassword(sb, { newPassword: GOOD, confirmPassword: GOOD })
    expect(res).toEqual({ ok: true, othersSignedOut: true })
    expect(sb.auth.updateUser).toHaveBeenCalledWith({ password: GOOD, data: { password_set: true } })
    expect(sb.auth.signOut).toHaveBeenCalledWith({ scope: 'others' })
  })

  it('asks for reauthentication when the session is stale', async () => {
    const sb = fakeSupabase({
      updateUser: vi.fn().mockResolvedValue({ data: {}, error: { code: 'reauthentication_needed', status: 400 } }),
    })
    const res = await setPassword(sb, { newPassword: GOOD, confirmPassword: GOOD })
    expect(res).toEqual({ ok: false, needsReauth: true })
    expect(sb.auth.signOut).not.toHaveBeenCalled()
  })

  it('sends the emailed code as the nonce on retry', async () => {
    const sb = fakeSupabase()
    await setPassword(sb, { newPassword: GOOD, confirmPassword: GOOD, nonce: ' 123456 ' })
    expect(sb.auth.updateUser).toHaveBeenCalledWith({
      password: GOOD,
      data: { password_set: true },
      nonce: '123456',
    })
  })

  it('reports a bad code as an error, not another reauth prompt', async () => {
    const sb = fakeSupabase({
      updateUser: vi.fn().mockResolvedValue({ data: {}, error: { code: 'reauthentication_not_valid' } }),
    })
    const res = await setPassword(sb, { newPassword: GOOD, confirmPassword: GOOD, nonce: '000000' })
    expect(res).toEqual({ ok: false, error: 'errors.reauthCodeInvalid' })
  })

  it('still succeeds when signing other sessions out fails', async () => {
    const sb = fakeSupabase({ signOut: vi.fn().mockResolvedValue({ error: { message: 'x' } }) })
    const res = await setPassword(sb, { newPassword: GOOD, confirmPassword: GOOD })
    expect(res).toEqual({ ok: true, othersSignedOut: false })
  })
})

describe('requestReauthentication', () => {
  it('maps a throttle to the rate-limit key', async () => {
    const sb = fakeSupabase({
      reauthenticate: vi.fn().mockResolvedValue({ data: {}, error: { status: 429 } }),
    })
    expect(await requestReauthentication(sb)).toEqual({ ok: false, error: 'errors.rateLimited' })
  })

  it('succeeds quietly', async () => {
    expect(await requestReauthentication(fakeSupabase())).toEqual({ ok: true })
  })
})

describe('hasPassword', () => {
  it('is false for no user', () => {
    expect(hasPassword(null)).toBe(false)
  })
  it('is true for an email identity', () => {
    expect(hasPassword({ identities: [{ provider: 'email' }] })).toBe(true)
  })
  it('is true when app_metadata lists email', () => {
    expect(hasPassword({ app_metadata: { providers: ['apple', 'email'] } })).toBe(true)
  })
  it('is false for an SSO-only account', () => {
    expect(
      hasPassword({ identities: [{ provider: 'apple' }], app_metadata: { provider: 'apple', providers: ['apple'] } }),
    ).toBe(false)
  })
  it('is true once an SSO account has set a password', () => {
    expect(
      hasPassword({ identities: [{ provider: 'apple' }], user_metadata: { password_set: true } }),
    ).toBe(true)
  })
})

describe('identities', () => {
  const apple = { provider: 'apple', identity_data: { email: 'x@privaterelay.appleid.com' } }
  const google = { provider: 'google', identity_data: { email: 'me@gmail.com' } }

  it('finds an identity by provider', () => {
    expect(findIdentity([apple, google], 'google')).toBe(google)
    expect(findIdentity([apple], 'google')).toBeNull()
    expect(findIdentity(null, 'apple')).toBeNull()
  })

  it('reads the identity email', () => {
    expect(identityEmail(apple)).toBe('x@privaterelay.appleid.com')
    expect(identityEmail({ provider: 'apple', identity_data: {} })).toBeNull()
  })

  it('never offers to unlink the last identity', () => {
    expect(canUnlink([apple])).toBe(false)
    expect(canUnlink([apple, google])).toBe(true)
    expect(canUnlink(undefined)).toBe(false)
  })
})

describe('authErrorKey — self-service codes', () => {
  it.each([
    ['reauthentication_needed', 'errors.reauthNeeded'],
    ['reauthentication_not_valid', 'errors.reauthCodeInvalid'],
    ['identity_already_exists', 'errors.identityAlreadyLinked'],
    ['single_identity_not_deletable', 'errors.lastSignInMethod'],
    ['manual_linking_disabled', 'errors.linkingUnavailable'],
  ])('%s → %s', (code, key) => {
    expect(authErrorKey({ code })).toBe(key)
  })
})
