import type { SupabaseClient } from '@supabase/supabase-js'
import { authErrorKey } from '@gracechords/core'
import type { AuthResult } from './authFlows'
import type { AuthLink } from './authLink'

// Completing a password reset that started in an email.
//
// Kept separate from passwordChange.ts because the two are not the same
// operation: changing a password from Account re-verifies the CURRENT password
// first, while a recovery link IS the proof of identity — there is no current
// password to ask for, by definition, since not knowing it is why the user is
// here.
//
// RN-free and dependency-injected like authFlows.ts, so it unit-tests headless.

type SupabaseAuth = Pick<SupabaseClient, 'auth'>

/**
 * Turn the tokens from a recovery/confirmation link into a live session.
 *
 * On success the user is signed in — which is what makes the reset form usable
 * at all, and what signs a new user in straight from their confirmation email.
 */
export async function adoptAuthLinkSession(
  supabase: SupabaseAuth,
  link: AuthLink,
): Promise<AuthResult> {
  if (link.kind === 'error') {
    // An expired or already-used link is the common case here, and it has its
    // own copy: "try again" is useless advice, requesting a fresh email is not.
    return { ok: false, error: 'errors.authLinkExpired' }
  }

  const { error } = await supabase.auth.setSession({
    access_token: link.accessToken,
    refresh_token: link.refreshToken,
  })
  if (error) {
    // GoTrue rejects an expired or replayed token here rather than at parse
    // time, so this lands on the same copy as a malformed link.
    return { ok: false, error: 'errors.authLinkExpired' }
  }
  return { ok: true }
}

/**
 * Set a new password for the user the recovery session belongs to.
 *
 * Callers validate length/mix first (authValidation.ts) — this reports only
 * what the server rejects, mapped through the shared authErrorKey so the screen
 * never renders a raw GoTrue message.
 */
export async function completePasswordReset(
  supabase: SupabaseAuth,
  input: { password: string },
): Promise<AuthResult> {
  const { error } = await supabase.auth.updateUser({ password: input.password })
  if (error) return { ok: false, error: authErrorKey(error) }
  return { ok: true }
}
