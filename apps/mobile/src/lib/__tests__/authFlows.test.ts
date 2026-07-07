import { describe, expect, it, vi } from 'vitest'
import {
  appleSignIn,
  emailSignIn,
  emailSignUp,
  googleSignIn,
  type AppleDeps,
  type GoogleDeps,
} from '../authFlows'

type SupabaseAuth = AppleDeps['supabase']

function fakeSupabase(overrides: Record<string, unknown> = {}): SupabaseAuth {
  return {
    auth: {
      signInWithIdToken: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signUp: vi.fn().mockResolvedValue({ data: { user: {}, session: {} }, error: null }),
      updateUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
      ...overrides,
    },
  } as unknown as SupabaseAuth
}

function appleDeps(overrides: Partial<AppleDeps> = {}): AppleDeps {
  return {
    supabase: fakeSupabase(),
    signInAsync: vi.fn().mockResolvedValue({ identityToken: 'apple-jwt', fullName: null }),
    sha256: vi.fn(async (s: string) => `sha256(${s})`),
    randomUUID: () => 'raw-nonce',
    isCancelError: (e) => (e as { code?: string })?.code === 'ERR_REQUEST_CANCELED',
    ...overrides,
  }
}

describe('appleSignIn', () => {
  it('sends the HASHED nonce to Apple and the RAW nonce + token to Supabase', async () => {
    const deps = appleDeps()
    const result = await appleSignIn(deps)

    expect(result).toEqual({ ok: true })
    expect(deps.sha256).toHaveBeenCalledWith('raw-nonce')
    expect(deps.signInAsync).toHaveBeenCalledWith('sha256(raw-nonce)')
    expect(deps.supabase.auth.signInWithIdToken).toHaveBeenCalledWith({
      provider: 'apple',
      token: 'apple-jwt',
      nonce: 'raw-nonce',
    })
  })

  it('persists the full name on first auth when metadata has none', async () => {
    const supabase = fakeSupabase({
      signInWithIdToken: vi
        .fn()
        .mockResolvedValue({ data: { user: { user_metadata: {} } }, error: null }),
    })
    const deps = appleDeps({
      supabase,
      signInAsync: vi.fn().mockResolvedValue({
        identityToken: 'apple-jwt',
        fullName: { givenName: 'Alex', familyName: 'Brown' },
      }),
    })

    await appleSignIn(deps)
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({
      data: { full_name: 'Alex Brown' },
    })
  })

  it('does NOT overwrite an existing full_name', async () => {
    const supabase = fakeSupabase({
      signInWithIdToken: vi.fn().mockResolvedValue({
        data: { user: { user_metadata: { full_name: 'Existing Name' } } },
        error: null,
      }),
    })
    const deps = appleDeps({
      supabase,
      signInAsync: vi.fn().mockResolvedValue({
        identityToken: 'apple-jwt',
        fullName: { givenName: 'Alex', familyName: 'Brown' },
      }),
    })

    await appleSignIn(deps)
    expect(supabase.auth.updateUser).not.toHaveBeenCalled()
  })

  it('does not call updateUser when Apple returns no name (later sign-ins)', async () => {
    const supabase = fakeSupabase({
      signInWithIdToken: vi
        .fn()
        .mockResolvedValue({ data: { user: { user_metadata: {} } }, error: null }),
    })
    const deps = appleDeps({ supabase })

    await appleSignIn(deps)
    expect(supabase.auth.updateUser).not.toHaveBeenCalled()
  })

  it('returns canceled silently and never touches Supabase when the sheet is dismissed', async () => {
    const supabase = fakeSupabase()
    const cancel = Object.assign(new Error('canceled'), { code: 'ERR_REQUEST_CANCELED' })
    const deps = appleDeps({ supabase, signInAsync: vi.fn().mockRejectedValue(cancel) })

    const result = await appleSignIn(deps)
    expect(result).toEqual({ ok: false, canceled: true })
    expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled()
  })

  it('errors when Apple returns no identity token', async () => {
    const supabase = fakeSupabase()
    const deps = appleDeps({
      supabase,
      signInAsync: vi.fn().mockResolvedValue({ identityToken: null }),
    })

    const result = await appleSignIn(deps)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/credential/i)
    expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled()
  })

  it('surfaces Supabase errors (e.g. nonce mismatch)', async () => {
    const supabase = fakeSupabase({
      signInWithIdToken: vi
        .fn()
        .mockResolvedValue({ data: {}, error: { message: 'Nonce mismatch' } }),
    })
    const result = await appleSignIn(appleDeps({ supabase }))
    expect(result).toEqual({ ok: false, error: 'Nonce mismatch' })
  })
})

function googleDeps(overrides: Partial<GoogleDeps> = {}): GoogleDeps {
  return {
    supabase: fakeSupabase(),
    configure: vi.fn(),
    signIn: vi.fn().mockResolvedValue({ idToken: 'google-jwt' }),
    isCancelError: (e) => (e as { code?: string })?.code === 'CANCELED',
    isPlayServicesError: (e) => (e as { code?: string })?.code === 'NO_PLAY_SERVICES',
    ...overrides,
  }
}

describe('googleSignIn', () => {
  it('configures before signing in and passes the id token to Supabase', async () => {
    const deps = googleDeps()
    const order: string[] = []
    ;(deps.configure as ReturnType<typeof vi.fn>).mockImplementation(() => order.push('configure'))
    ;(deps.signIn as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push('signIn')
      return { idToken: 'google-jwt' }
    })

    const result = await googleSignIn(deps)
    expect(result).toEqual({ ok: true })
    expect(order).toEqual(['configure', 'signIn'])
    expect(deps.supabase.auth.signInWithIdToken).toHaveBeenCalledWith({
      provider: 'google',
      token: 'google-jwt',
    })
  })

  it('returns canceled silently when the sheet is dismissed', async () => {
    const supabase = fakeSupabase()
    const cancel = Object.assign(new Error('canceled'), { code: 'CANCELED' })
    const deps = googleDeps({ supabase, signIn: vi.fn().mockRejectedValue(cancel) })

    const result = await googleSignIn(deps)
    expect(result).toEqual({ ok: false, canceled: true })
    expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled()
  })

  it('reports missing Play Services with a friendly message', async () => {
    const err = Object.assign(new Error('nope'), { code: 'NO_PLAY_SERVICES' })
    const result = await googleSignIn(googleDeps({ signIn: vi.fn().mockRejectedValue(err) }))
    expect(result.ok).toBe(false)
    expect(result.error).toBe('errors.googlePlayUnavailable')
  })

  it('errors when no id token comes back', async () => {
    const supabase = fakeSupabase()
    const deps = googleDeps({ supabase, signIn: vi.fn().mockResolvedValue({ idToken: null }) })

    const result = await googleSignIn(deps)
    expect(result.ok).toBe(false)
    expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled()
  })
})

describe('emailSignIn', () => {
  it('trims the email and reports success', async () => {
    const supabase = fakeSupabase()
    const result = await emailSignIn(supabase, { email: '  alex@example.com ', password: 'pw' })
    expect(result).toEqual({ ok: true })
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'alex@example.com',
      password: 'pw',
    })
  })

  it('surfaces auth errors', async () => {
    const supabase = fakeSupabase({
      signInWithPassword: vi
        .fn()
        .mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } }),
    })
    const result = await emailSignIn(supabase, { email: 'a@b.co', password: 'pw' })
    expect(result).toEqual({ ok: false, error: 'Invalid login credentials' })
  })
})

describe('emailSignUp', () => {
  const input = { fullName: ' Alex Brown ', email: 'alex@example.com', password: 'longenough' }

  it('passes the trimmed full name in options.data and succeeds with a session', async () => {
    const supabase = fakeSupabase()
    const result = await emailSignUp(supabase, input)
    expect(result).toEqual({ ok: true })
    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: 'alex@example.com',
      password: 'longenough',
      options: { data: { full_name: 'Alex Brown' } },
    })
  })

  it('flags needsConfirmation when no session is returned (confirm-email ON)', async () => {
    const supabase = fakeSupabase({
      signUp: vi.fn().mockResolvedValue({
        data: { user: { identities: [{ id: 'x' }] }, session: null },
        error: null,
      }),
    })
    const result = await emailSignUp(supabase, input)
    expect(result).toEqual({ ok: true, needsConfirmation: true })
  })

  it('treats an existing email (identities: []) the same as needsConfirmation — no existence leak', async () => {
    const supabase = fakeSupabase({
      signUp: vi.fn().mockResolvedValue({
        data: { user: { identities: [] }, session: null },
        error: null,
      }),
    })
    const result = await emailSignUp(supabase, input)
    expect(result).toEqual({ ok: true, needsConfirmation: true })
  })

  it('surfaces signUp errors', async () => {
    const supabase = fakeSupabase({
      signUp: vi.fn().mockResolvedValue({ data: {}, error: { message: 'Password too weak' } }),
    })
    const result = await emailSignUp(supabase, input)
    expect(result).toEqual({ ok: false, error: 'Password too weak' })
  })
})
