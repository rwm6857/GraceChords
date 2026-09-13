// Map a Supabase/GoTrue auth error to an auth-namespace i18n key.
//
// Nothing from a provider response may reach a user verbatim. Auth errors used
// to be passed through as `error.message`, which put GoTrue's own wording in
// front of whoever was holding the device — most visibly on sign-up, where the
// password policy surfaced as "Password should contain at least one character of
// each: abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789,
// !@#$%^&*()_+-=[]{};'\:"|<>?,./`~." (QA report Nº 6994, M-02).
//
// Always returns a key. There is no passthrough branch and no raw-message
// escape hatch — an unrecognised error becomes 'errors.generic', and the caller
// logs the real text rather than rendering it.
//
// Codes are matched first (GoTrue sets a stable `code` on modern versions);
// message matching is the fallback for responses that predate them.

/** Supabase auth errors are plain objects, not Error instances. */
type AuthErrorish =
  | { message?: unknown; status?: unknown; code?: unknown; error_code?: unknown }
  | null
  | undefined

function codeOf(error: AuthErrorish): string {
  if (!error || typeof error !== 'object') return ''
  return String(error.code ?? error.error_code ?? '').toLowerCase()
}

function messageOf(error: AuthErrorish): string {
  if (!error || typeof error !== 'object') return ''
  return String(error.message ?? '').toLowerCase()
}

function statusOf(error: AuthErrorish): number | null {
  if (!error || typeof error !== 'object') return null
  const status = Number(error.status)
  return Number.isFinite(status) ? status : null
}

// React Native's fetch rejects with a bare TypeError on an unreachable host — no
// code, no cause, nothing but the string. Matching on it is unlovely, but it is
// the difference between telling a user to check their connection and telling
// them nothing useful, and it is the most common real failure this app sees.
function isNetworkFailure(error: AuthErrorish): boolean {
  const message = messageOf(error)
  return (
    message.includes('network request failed') ||
    message.includes('failed to fetch') ||
    message.includes('network error')
  )
}

/**
 * @returns an `auth` namespace key, e.g. 'errors.invalidCredentials'. Never a
 * provider message, and never null.
 */
export function authErrorKey(error: AuthErrorish): string {
  if (!error) return 'errors.generic'

  // Network first: a request that never reached GoTrue has no meaningful code,
  // and "check your connection" beats every other reading of the failure.
  if (isNetworkFailure(error)) return 'errors.network'

  const code = codeOf(error)
  const message = messageOf(error)
  const status = statusOf(error)

  if (status === 429 || code.includes('rate_limit') || message.includes('rate limit')) {
    return 'errors.rateLimited'
  }

  if (code === 'weak_password' || code === 'password_required_characters') {
    return 'errors.passwordNeedsMix'
  }
  if (code === 'same_password') return 'errors.passwordSameAsCurrent'

  if (code === 'invalid_credentials' || code === 'invalid_grant') {
    return 'errors.invalidCredentials'
  }
  if (code === 'email_not_confirmed') return 'errors.emailNotConfirmed'
  if (code === 'email_exists' || code === 'user_already_exists') {
    return 'errors.emailExists'
  }
  if (code === 'invalid_email' || code === 'validation_failed') {
    return 'errors.invalidEmail'
  }
  if (code === 'over_email_send_rate_limit') return 'errors.rateLimited'

  // Message fallbacks for responses without a code.
  if (message.includes('invalid login') || message.includes('invalid credentials')) {
    return 'errors.invalidCredentials'
  }
  if (message.includes('email not confirmed')) return 'errors.emailNotConfirmed'
  if (message.includes('already registered') || message.includes('already been registered')) {
    return 'errors.emailExists'
  }
  if (message.includes('password should') || message.includes('password must')) {
    return 'errors.passwordNeedsMix'
  }
  if (message.includes('too many requests')) return 'errors.rateLimited'

  return 'errors.generic'
}
