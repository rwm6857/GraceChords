import { describe, expect, it, vi } from 'vitest'
import { changePassword } from '../passwordChange'
import { validatePasswordStrength } from '../authValidation'

type Auth = Parameters<typeof changePassword>[0]

const GOOD = 'NewPassw0rd!'

function fakeSupabase(overrides: Record<string, unknown> = {}): Auth {
  return {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
      updateUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      ...overrides,
    },
  } as unknown as Auth
}

function input(overrides: Partial<Parameters<typeof changePassword>[1]> = {}) {
  return {
    email: 'user@example.com',
    currentPassword: 'OldPassw0rd!',
    newPassword: GOOD,
    confirmPassword: GOOD,
    ...overrides,
  }
}

describe('validatePasswordStrength', () => {
  it('accepts a password meeting the configured policy', () => {
    expect(validatePasswordStrength(GOOD)).toBeNull()
  })

  it('rejects anything under the minimum length', () => {
    expect(validatePasswordStrength('Ab1!')).toBe('errors.passwordTooShort')
  })

  it.each([
    ['no lowercase', 'NEWPASSW0RD!'],
    ['no uppercase', 'newpassw0rd!'],
    ['no digit', 'NewPassword!'],
    ['no symbol', 'NewPassw0rd'],
  ])('rejects a long password with %s', (_label, password) => {
    expect(validatePasswordStrength(password)).toBe('errors.passwordNeedsMix')
  })
})

describe('changePassword', () => {
  it('verifies, updates, then drops other sessions — in that order', async () => {
    const supabase = fakeSupabase()
    const result = await changePassword(supabase, input())

    expect(result).toEqual({ ok: true, othersSignedOut: true })
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'OldPassw0rd!',
    })
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: GOOD })
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'others' })
  })

  it('does NOT sign the user out when the current password is wrong', async () => {
    const supabase = fakeSupabase({
      signInWithPassword: vi
        .fn()
        .mockResolvedValue({ data: {}, error: { code: 'invalid_credentials', status: 400 } }),
    })
    const result = await changePassword(supabase, input())

    expect(result).toEqual({ ok: false, error: 'errors.wrongCurrentPassword' })
    expect(supabase.auth.signOut).not.toHaveBeenCalled()
    expect(supabase.auth.updateUser).not.toHaveBeenCalled()
  })

  it('reports rate limiting distinctly from a wrong password', async () => {
    const supabase = fakeSupabase({
      signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: { status: 429 } }),
    })
    expect(await changePassword(supabase, input())).toEqual({
      ok: false,
      error: 'errors.rateLimitedSignIn',
    })
  })

  it('reports a network failure distinctly', async () => {
    const supabase = fakeSupabase({
      signInWithPassword: vi
        .fn()
        .mockResolvedValue({ data: {}, error: { message: 'Network request failed' } }),
    })
    expect(await changePassword(supabase, input())).toEqual({ ok: false, error: 'errors.network' })
  })

  it('rejects a mismatched confirmation before touching the network', async () => {
    const supabase = fakeSupabase()
    const result = await changePassword(supabase, input({ confirmPassword: 'Different1!' }))

    expect(result).toEqual({ ok: false, error: 'errors.passwordMismatch' })
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('rejects a new password identical to the current one', async () => {
    const supabase = fakeSupabase()
    const result = await changePassword(
      supabase,
      input({ currentPassword: GOOD, newPassword: GOOD, confirmPassword: GOOD }),
    )

    expect(result).toEqual({ ok: false, error: 'errors.passwordSameAsCurrent' })
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('rejects a policy-failing new password client-side', async () => {
    const supabase = fakeSupabase()
    const result = await changePassword(
      supabase,
      input({ newPassword: 'alllowercase1', confirmPassword: 'alllowercase1' }),
    )

    expect(result).toEqual({ ok: false, error: 'errors.passwordNeedsMix' })
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('maps the server-side weak_password rejection to the same message', async () => {
    const supabase = fakeSupabase({
      updateUser: vi.fn().mockResolvedValue({ data: {}, error: { code: 'weak_password', status: 422 } }),
    })
    expect(await changePassword(supabase, input())).toEqual({
      ok: false,
      error: 'errors.passwordNeedsMix',
    })
  })

  it('still reports success when only the other-session sign-out fails', async () => {
    const supabase = fakeSupabase({
      signOut: vi.fn().mockResolvedValue({ error: { message: 'boom' } }),
    })
    expect(await changePassword(supabase, input())).toEqual({ ok: true, othersSignedOut: false })
  })

  it('requires a current password', async () => {
    const supabase = fakeSupabase()
    expect(await changePassword(supabase, input({ currentPassword: '' }))).toEqual({
      ok: false,
      error: 'errors.currentPasswordRequired',
    })
  })
})
