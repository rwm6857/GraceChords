// Reads an inbound Supabase auth email link, and holds what it carries until
// the screen that consumes it mounts.
//
// FLOW TYPE: this parses the IMPLICIT flow — the tokens arrive in the URL
// fragment. That is a deliberate choice over PKCE, and the reason is
// portability. PKCE stores its code verifier in the requesting client's own
// storage (@supabase/auth-js keys it `${storageKey}-code-verifier`) and
// _exchangeCodeForSession throws AuthPKCECodeVerifierMissingError without it,
// so a PKCE link only works on the device that asked for it. A recovery email
// opened on a laptop, or in a mail client's in-app browser that does not fire
// App Links, would simply fail — where today it lands on the web page and
// works. Implicit keeps every one of those fallbacks intact, and it is also
// what the web app already uses, so nothing in the shared Supabase factory
// (packages/core/src/supabase/client.js) has to change.
//
// The trade-off, stated plainly: the tokens travel in the link. That is the
// exposure the web app already accepts for the same emails, and it is why they
// are held in this module rather than passed as router params — see below.

/** What an auth email link turned out to be. */
export type AuthLink =
  | { kind: 'recovery'; accessToken: string; refreshToken: string }
  | { kind: 'signup'; accessToken: string; refreshToken: string }
  | { kind: 'error'; code: string | null; description: string | null }

/**
 * The two paths the app claims (see apps/web/public/.well-known/README.md).
 * They are deliberately NOT the web app's own /reset-password and
 * /auth/callback: those are the targets of browser-initiated flows, including
 * web's signInWithOAuth, and claiming them would pull a browser sign-in into
 * the app mid-handshake.
 */
const APP_AUTH_PATHS = ['/app/reset-password', '/app/auth/callback']

// The custom scheme carries no real host, so URL() reads the first segment as
// one: gracechords://app/reset-password parses with host "app" and pathname
// "/reset-password", which matches nothing above. Strip the scheme so the whole
// remainder is read as a path — the same thing resolveDeepLinkPath does, for the
// same reason.
//
// This form is not just theoretical: it is how a deep link is opened against a
// simulator (xcrun simctl openurl / adb am start), where https links cannot be
// verified against an undeployed AASA or an unmatched signing certificate.
const APP_SCHEME = 'gracechords://'

function paramsOf(raw: string): URLSearchParams {
  return new URLSearchParams(raw.startsWith('#') || raw.startsWith('?') ? raw.slice(1) : raw)
}

/**
 * Parse an inbound link if it is one of the app's auth paths, else null.
 *
 * Supabase puts implicit-flow results in the FRAGMENT, and error results
 * sometimes in the query string instead, so both are read. A link on an auth
 * path that carries neither a usable token pair nor an error is still reported
 * as an error rather than null: it reached us on a path only an auth email
 * uses, so sending the user quietly to Home would hide a real failure.
 */
export function parseAuthLink(url: string): AuthLink | null {
  let parsed: URL
  try {
    const href = url.startsWith(APP_SCHEME) ? `/${url.slice(APP_SCHEME.length)}` : url
    parsed = new URL(href, 'https://gracechords.com')
  } catch {
    return null
  }
  if (!APP_AUTH_PATHS.includes(parsed.pathname.replace(/\/$/, ''))) return null

  const hash = paramsOf(parsed.hash)
  const query = paramsOf(parsed.search)
  const pick = (key: string) => hash.get(key) ?? query.get(key)

  const error = pick('error') ?? pick('error_code')
  if (error) {
    return {
      kind: 'error',
      code: pick('error_code') ?? pick('error'),
      description: pick('error_description'),
    }
  }

  const accessToken = pick('access_token')
  const refreshToken = pick('refresh_token')
  if (accessToken && refreshToken) {
    // `type` is absent on some providers' links; the path already tells us
    // which flow asked for it, so fall back to that rather than refusing.
    const type = pick('type')
    const kind =
      type === 'recovery' || (!type && parsed.pathname.includes('reset-password'))
        ? 'recovery'
        : 'signup'
    return { kind, accessToken, refreshToken }
  }

  return { kind: 'error', code: null, description: null }
}

// Held in the module rather than passed as router params on purpose: a session
// token in a route param ends up in navigation state and anything that logs it.
// This is the same hand-off shape as topRoute.ts and pendingRoute.ts — set by
// app/+native-intent.tsx, which runs outside React, read once by the screen.
let pending: AuthLink | null = null

export function setPendingAuthLink(link: AuthLink): void {
  pending = link
}

/** Read and clear. Consumed once, so a re-mount cannot replay a used token. */
export function takePendingAuthLink(): AuthLink | null {
  const link = pending
  pending = null
  return link
}

/** Test-only reset so each test starts from a clean module state. */
export function __resetAuthLinkForTest(): void {
  pending = null
}
