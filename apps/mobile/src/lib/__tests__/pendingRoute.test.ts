import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetPendingRouteForTest,
  clearInboundLink,
  holdInboundLink,
  noteInboundLink,
  takeHeldLink,
} from '../pendingRoute'

// The module is a hand-off between app/+native-intent.tsx and the auth gate in
// app/_layout.tsx. Neither is importable here (both pull in native code), so
// these tests drive the module through the exact call order the gate makes,
// mirrored below. If that branch order changes, change this with it.

/** The gate's decision for one pass, as app/_layout.tsx makes it. */
function gate({
  session,
  seg,
}: {
  session: boolean
  seg: string | undefined
}): string | null {
  const inAuthFlow = seg === 'login' || seg === 'choose-icon' || seg === 'forgot-password'
  const isPublic = seg === 'session' || seg === 'sheet'

  if (!session && !inAuthFlow && !isPublic) {
    holdInboundLink()
    return '/login'
  }
  clearInboundLink()

  const atDefaultLanding = seg === 'login' || seg === undefined || seg === '(tabs)'
  if (session && atDefaultLanding) {
    const held = takeHeldLink()
    if (held) return held
  }
  if (session && seg === 'login') return '/'
  return null
}

describe('a shared link opened by a signed-out recipient', () => {
  beforeEach(__resetPendingRouteForTest)

  it('resumes the song after they sign in', () => {
    noteInboundLink('/viewer/great-is-thy-faithfulness')
    expect(gate({ session: false, seg: 'viewer' })).toBe('/login')
    expect(gate({ session: true, seg: 'login' })).toBe('/viewer/great-is-thy-faithfulness')
  })

  it('resumes after a brand-new user signs UP, who never passes through /login', () => {
    // Sign-up goes /login -> /choose-icon -> the tab group. This is the path
    // that matters most: a link shared with someone without an account yet.
    noteInboundLink('/setlist/import?ids=a,b&toKeys=C,D')
    expect(gate({ session: false, seg: 'setlist' })).toBe('/login')
    expect(gate({ session: false, seg: 'login' })).toBeNull()
    expect(gate({ session: false, seg: 'choose-icon' })).toBeNull()
    expect(gate({ session: true, seg: 'choose-icon' })).toBeNull()
    expect(gate({ session: true, seg: undefined })).toBe('/setlist/import?ids=a,b&toKeys=C,D')
  })

  it('keeps the query string, which is the whole payload for a shared set', () => {
    noteInboundLink('/setlist/import?ids=a,b&toKeys=C,D')
    gate({ session: false, seg: 'setlist' })
    expect(gate({ session: true, seg: 'login' })).toBe('/setlist/import?ids=a,b&toKeys=C,D')
  })

  it('resumes only once, so a later sign-in lands on Home', () => {
    noteInboundLink('/viewer/song')
    gate({ session: false, seg: 'viewer' })
    expect(gate({ session: true, seg: 'login' })).toBe('/viewer/song')
    expect(gate({ session: true, seg: 'login' })).toBe('/')
  })
})

describe('links the gate must NOT resume', () => {
  beforeEach(__resetPendingRouteForTest)

  it('ignores a link that was opened while signed in and never discarded', () => {
    // Opened fine, viewed, then the user signs out and back in much later. The
    // destination was never taken from them, so nothing should reopen.
    noteInboundLink('/viewer/song')
    expect(gate({ session: true, seg: 'viewer' })).toBeNull()
    expect(gate({ session: false, seg: '(tabs)' })).toBe('/login')
    expect(gate({ session: true, seg: 'login' })).toBe('/')
  })

  it('ignores the anonymous session follower, which is reachable signed out', () => {
    noteInboundLink('/session/ABC123')
    expect(gate({ session: false, seg: 'session' })).toBeNull()
    expect(gate({ session: true, seg: 'login' })).toBe('/')
  })

  it('holds nothing when a signed-out user simply opens the app', () => {
    expect(gate({ session: false, seg: '(tabs)' })).toBe('/login')
    expect(gate({ session: true, seg: 'login' })).toBe('/')
  })

  it('holds the newest link when two arrive before sign-in', () => {
    noteInboundLink('/viewer/first')
    gate({ session: false, seg: 'viewer' })
    noteInboundLink('/viewer/second')
    gate({ session: false, seg: 'viewer' })
    expect(gate({ session: true, seg: 'login' })).toBe('/viewer/second')
  })
})
