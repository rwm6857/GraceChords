import { beforeEach, describe, expect, it } from 'vitest'
import type { Session, User } from '@supabase/supabase-js'
import {
  getCurrentUserSnapshot,
  resetCurrentUserForTests,
  setCurrentUserFromSession,
  subscribeCurrentUser,
} from '../currentUser'

function user(overrides: Partial<User> & { id: string }): User {
  return {
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as User
}

function session(u: User | null): Session | null {
  return u ? ({ access_token: 'token', user: u } as Session) : null
}

/** Count emissions across a publish. */
function countEmissions(publish: () => void): number {
  let notified = 0
  const unsubscribe = subscribeCurrentUser(() => {
    notified += 1
  })
  publish()
  unsubscribe()
  return notified
}

beforeEach(() => {
  resetCurrentUserForTests()
})

describe('before the root publishes', () => {
  it('reports unresolved with a null user', () => {
    // A screen mounting here must be able to tell "not known yet" from "signed
    // out" — useProfileSprite relies on it to avoid clearing a good sprite and
    // immediately re-fetching it.
    expect(getCurrentUserSnapshot()).toStrictEqual({ user: null, resolved: false })
  })
})

describe('setCurrentUserFromSession', () => {
  it('publishes the session user and marks auth resolved', () => {
    const u = user({ id: 'u1', email: 'a@example.test' })
    setCurrentUserFromSession(session(u))
    expect(getCurrentUserSnapshot()).toStrictEqual({ user: u, resolved: true })
  })

  it('resolves to a null user for a signed-out session', () => {
    setCurrentUserFromSession(null)
    expect(getCurrentUserSnapshot()).toStrictEqual({ user: null, resolved: true })
  })

  it('notifies subscribers on each real identity change', () => {
    expect(countEmissions(() => setCurrentUserFromSession(session(user({ id: 'u1' }))))).toBe(1)
    expect(countEmissions(() => setCurrentUserFromSession(session(user({ id: 'u2' }))))).toBe(1)
  })

  it('publishes the first resolution even when it resolves to null', () => {
    // Unresolved-null and resolved-null are different states, so the initial
    // signed-out publish must not be swallowed by the equality guard.
    expect(countEmissions(() => setCurrentUserFromSession(null))).toBe(1)
  })

  it('swallows a repeated signed-out publish', () => {
    setCurrentUserFromSession(null)
    expect(countEmissions(() => setCurrentUserFromSession(null))).toBe(0)
  })

  it('keeps a stable snapshot across an unchanged TOKEN_REFRESHED', () => {
    // auth-js hands over a NEW User object on every refresh (~hourly) with
    // identical content. Replacing state on those would re-render Home, Settings
    // and the Daily Word landing for nothing, and would break the reference
    // stability useSyncExternalStore requires of getSnapshot.
    const first = user({ id: 'u1', email: 'a@example.test', user_metadata: { full_name: 'Ada L' } })
    setCurrentUserFromSession(session(first))
    const before = getCurrentUserSnapshot()

    const refreshed = user({
      id: 'u1',
      email: 'a@example.test',
      user_metadata: { full_name: 'Ada L' },
    })
    expect(refreshed).not.toBe(first)

    expect(countEmissions(() => setCurrentUserFromSession(session(refreshed)))).toBe(0)
    expect(getCurrentUserSnapshot()).toBe(before)
  })

  it.each([
    ['display name', { full_name: 'Ada B' }],
    ['legacy name field', { name: 'Ada B' }],
    ['avatar', { avatar_url: 'b.png' }],
  ])('publishes when the %s changes', (_label, changed) => {
    const base = { full_name: 'Ada L', name: 'Ada L', avatar_url: 'a.png' }
    setCurrentUserFromSession(session(user({ id: 'u1', user_metadata: { ...base } })))
    const before = getCurrentUserSnapshot()
    setCurrentUserFromSession(
      session(user({ id: 'u1', user_metadata: { ...base, ...changed } })),
    )
    expect(getCurrentUserSnapshot()).not.toBe(before)
  })

  it('publishes when the email changes', () => {
    setCurrentUserFromSession(session(user({ id: 'u1', email: 'a@example.test' })))
    const before = getCurrentUserSnapshot()
    setCurrentUserFromSession(session(user({ id: 'u1', email: 'b@example.test' })))
    expect(getCurrentUserSnapshot()).not.toBe(before)
  })

  it('publishes a sign-out after a signed-in user', () => {
    setCurrentUserFromSession(session(user({ id: 'u1' })))
    expect(countEmissions(() => setCurrentUserFromSession(null))).toBe(1)
    expect(getCurrentUserSnapshot()).toStrictEqual({ user: null, resolved: true })
  })

  it('publishes an account switch even when the metadata matches', () => {
    // Same name, different account — useProfileSprite keys its cache reset on
    // the id, so this must not be treated as unchanged.
    const meta = { full_name: 'Ada L' }
    setCurrentUserFromSession(session(user({ id: 'u1', user_metadata: { ...meta } })))
    expect(
      countEmissions(() =>
        setCurrentUserFromSession(session(user({ id: 'u2', user_metadata: { ...meta } }))),
      ),
    ).toBe(1)
    expect(getCurrentUserSnapshot().user?.id).toBe('u2')
  })

  it('stops notifying after unsubscribe', () => {
    let notified = 0
    const unsubscribe = subscribeCurrentUser(() => {
      notified += 1
    })
    unsubscribe()
    setCurrentUserFromSession(session(user({ id: 'u1' })))
    expect(notified).toBe(0)
  })
})
