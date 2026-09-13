// Change-password orchestration for Account → Change password. Pure and
// dependency-injected (only the supabase auth surface, type-only) so the vitest
// harness exercises it headless, matching authFlows.ts.
//
// The current-password prompt is a UX guard against an accidental or unattended
// change — nothing more. This project has "Secure password change" and "Require
// current password when updating" both OFF in the Supabase dashboard, so
// updateUser() succeeds on the session alone; verifying the old password is our
// own front-door check, not a security control, and it should not be described
// as one.
//
// Chosen over Supabase's reauthenticate() nonce flow deliberately: that path
// needs an email round trip, which fails in the low-connectivity settings this
// app is used in.
import type { SupabaseClient } from '@supabase/supabase-js'
import { authErrorKey } from '@gracechords/core'
import { validatePasswordStrength } from './authValidation'

type SupabaseAuth = Pick<SupabaseClient, 'auth'>

export type PasswordChangeResult = {
  ok: boolean
  /**
   * ALWAYS an auth-namespace i18n key (errors.*) — ours, or one mapped from a
   * provider failure by authErrorKey(). Never a raw Supabase message.
   */
  error?: string
  /**
   * False when the password changed but signing other devices out failed. The
   * change itself succeeded, so the screen still reports success — this exists
   * so the caller can log the difference.
   */
  othersSignedOut?: boolean
}

/**
 * Two of authErrorKey's generic keys need change-password-specific wording, so
 * they are remapped here rather than in the shared mapper.
 *
 * A wrong password is `invalid_credentials`, which on the sign-in screen means
 * "that email or password is wrong" but here means "that CURRENT password is
 * wrong" — a different sentence about a different field.
 *
 * A throttle is the general SIGN-IN limit, not a change-password-specific one
 * (Supabase throttles by IP and account on the same endpoint), so repeated wrong
 * guesses lock the user out of signing in anywhere — which the copy must say.
 */
function contextualise(key: string): string {
  if (key === 'errors.invalidCredentials') return 'errors.wrongCurrentPassword'
  if (key === 'errors.rateLimited') return 'errors.rateLimitedSignIn'
  return key
}

export type ChangePasswordInput = {
  email: string
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

export async function changePassword(
  supabase: SupabaseAuth,
  input: ChangePasswordInput,
): Promise<PasswordChangeResult> {
  const { email, currentPassword, newPassword, confirmPassword } = input

  if (!currentPassword) return { ok: false, error: 'errors.currentPasswordRequired' }
  if (newPassword !== confirmPassword) return { ok: false, error: 'errors.passwordMismatch' }
  if (newPassword === currentPassword) return { ok: false, error: 'errors.passwordSameAsCurrent' }

  const weak = validatePasswordStrength(newPassword)
  if (weak) return { ok: false, error: weak }

  // 1. Verify the current password.
  //
  // A FAILURE HERE MUST NOT SIGN THE USER OUT. supabase-js leaves the stored
  // session untouched when signInWithPassword rejects, so returning early is
  // enough — do not add a signOut() on this path.
  //
  // On success a fresh session for the SAME user replaces the stored one. The
  // root layout's onAuthStateChange fires, but currentUser.ts compares identity
  // rather than object reference, so nothing re-renders and nothing flashes.
  const verify = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password: currentPassword,
  })
  if (verify.error) {
    return { ok: false, error: contextualise(authErrorKey(verify.error)) }
  }

  // 2. Set the new password.
  const update = await supabase.auth.updateUser({ password: newPassword })
  if (update.error) {
    return { ok: false, error: contextualise(authErrorKey(update.error)) }
  }

  // 3. Drop every OTHER session, keeping this device signed in. The password is
  // already changed at this point, so a failure here is reported, not raised —
  // telling the user the change failed would be untrue and would invite a retry
  // that then trips the same-password check.
  const signOut = await supabase.auth.signOut({ scope: 'others' })
  return { ok: true, othersSignedOut: !signOut.error }
}
