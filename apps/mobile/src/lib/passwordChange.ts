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
import { validatePasswordStrength } from './authValidation'

type SupabaseAuth = Pick<SupabaseClient, 'auth'>

export type PasswordChangeResult = {
  ok: boolean
  /**
   * An auth-namespace i18n key (errors.*) for our own failures, or a raw
   * passthrough message from Supabase. The screen renders it through
   * t(error, { defaultValue: error }) so both forms display.
   */
  error?: string
  /**
   * False when the password changed but signing other devices out failed. The
   * change itself succeeded, so the screen still reports success — this exists
   * so the caller can log the difference.
   */
  othersSignedOut?: boolean
}

// Supabase auth errors are plain objects: { message, status, code, name }.
type AuthErrorish = { message?: string; status?: number; code?: string } | null | undefined

function code(e: AuthErrorish): string {
  return String(e?.code ?? '')
}

/**
 * Supabase throttles by IP and account, and the limit it applies here is the
 * general sign-in limit — not a change-password-specific one. So repeated wrong
 * guesses lock the user out of signing in anywhere, which the copy must say.
 */
function isRateLimited(e: AuthErrorish): boolean {
  return e?.status === 429 || code(e).includes('rate_limit')
}

function isWrongPassword(e: AuthErrorish): boolean {
  return code(e) === 'invalid_credentials' || code(e) === 'invalid_grant'
}

function isWeakPassword(e: AuthErrorish): boolean {
  return code(e) === 'weak_password'
}

function isSamePassword(e: AuthErrorish): boolean {
  return code(e) === 'same_password'
}

// React Native's fetch rejects with a bare TypeError on an unreachable host —
// no code, no cause. Same string match as errors.ts, inlined to keep this
// module free of that module's RN-adjacent imports.
function isNetworkFailure(e: AuthErrorish): boolean {
  const message = String(e?.message ?? '').toLowerCase()
  return (
    message.includes('network request failed') ||
    message.includes('failed to fetch') ||
    message.includes('network error')
  )
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
    const e = verify.error as AuthErrorish
    if (isRateLimited(e)) return { ok: false, error: 'errors.rateLimitedSignIn' }
    if (isWrongPassword(e)) return { ok: false, error: 'errors.wrongCurrentPassword' }
    if (isNetworkFailure(e)) return { ok: false, error: 'errors.network' }
    return { ok: false, error: e?.message || 'errors.generic' }
  }

  // 2. Set the new password.
  const update = await supabase.auth.updateUser({ password: newPassword })
  if (update.error) {
    const e = update.error as AuthErrorish
    if (isRateLimited(e)) return { ok: false, error: 'errors.rateLimitedSignIn' }
    if (isSamePassword(e)) return { ok: false, error: 'errors.passwordSameAsCurrent' }
    if (isWeakPassword(e)) return { ok: false, error: 'errors.passwordNeedsMix' }
    if (isNetworkFailure(e)) return { ok: false, error: 'errors.network' }
    return { ok: false, error: e?.message || 'errors.generic' }
  }

  // 3. Drop every OTHER session, keeping this device signed in. The password is
  // already changed at this point, so a failure here is reported, not raised —
  // telling the user the change failed would be untrue and would invite a retry
  // that then trips the same-password check.
  const signOut = await supabase.auth.signOut({ scope: 'others' })
  return { ok: true, othersSignedOut: !signOut.error }
}
