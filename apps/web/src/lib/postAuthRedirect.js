// Where to land after an OAuth round trip (sign-in or linking a provider).
// Kept in sessionStorage rather than a query param on the redirect URL, so the
// Supabase redirect allow-list only ever needs the bare /auth/callback.
const KEY = 'gc_post_auth_redirect'

// Same-origin paths only: a stored value must never become an open redirect.
function safePath(path) {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') ? path : null
}

export function rememberPostAuthRedirect(path) {
  try {
    sessionStorage.setItem(KEY, safePath(path) || '/')
  } catch {
    /* storage unavailable — fall back to '/' */
  }
}

export function consumePostAuthRedirect() {
  try {
    const path = safePath(sessionStorage.getItem(KEY))
    sessionStorage.removeItem(KEY)
    return path || '/'
  } catch {
    return '/'
  }
}

export function oauthRedirectUrl() {
  return window.location.origin + '/auth/callback'
}

// GoTrue reports a failed OAuth round trip (a cancelled Apple sheet, a provider
// already linked to another account, an expired email link) as error params on
// the redirect — in the query string, the fragment, or both.
export function readCallbackError(location = window.location) {
  const params = [
    new URLSearchParams(location.search),
    new URLSearchParams((location.hash || '').replace(/^#/, '')),
  ]
  for (const p of params) {
    if (p.get('error') || p.get('error_code')) {
      return {
        code: p.get('error_code') || p.get('error') || '',
        description: p.get('error_description') || '',
      }
    }
  }
  return null
}
