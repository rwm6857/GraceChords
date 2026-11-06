// Password self-service shared by web (Profile → Security) and mobile
// (Account → Security). Pure and dependency-injected (only the supabase auth
// surface, type-only) so it runs headless under vitest.
//
// Server-side, "Secure password change" is ON in the Supabase dashboard: an
// updateUser({ password }) on a session older than 24h is rejected with
// `reauthentication_needed` unless it carries a nonce from reauthenticate().
//
// changePassword() never hits that wall. Verifying the current password with
// signInWithPassword() mints a fresh session, and the fresh session is what the
// 24h rule checks — so knowing the old password IS the reauthentication, with
// no email round trip (which fails in the low-connectivity settings the mobile
// app is used in).
//
// setPassword() is for accounts that only have Apple / Google sign-in and so
// have no password to prove. A stale session there gets `needsReauth`, and the
// caller sends the emailed code back as `nonce`.
import type { SupabaseClient } from '@supabase/supabase-js'
import { authErrorKey } from './authErrorKey'
import { validatePasswordStrength } from './passwordPolicy'

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

export type SetPasswordInput = {
  newPassword: string
  confirmPassword: string
  /** The code from reauthenticate()'s email, once `needsReauth` came back. */
  nonce?: string
}

export type SetPasswordResult = PasswordChangeResult & {
  /**
   * The session is too old to set a password on its own. Call
   * requestReauthentication(), then retry with the emailed code as `nonce`.
   */
  needsReauth?: boolean
}

function errorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return ''
  const e = error as { code?: unknown; error_code?: unknown }
  return String(e.code ?? e.error_code ?? '').toLowerCase()
}

/**
 * Add a password to an account that signs in with Apple / Google only, so it
 * can also sign in with email + password (e.g. an iOS Apple account on the web).
 *
 * GoTrue does not add an `email` identity when an SSO account sets a password,
 * so `password_set` is recorded in user_metadata for hasPassword() to read.
 */
export async function setPassword(
  supabase: SupabaseAuth,
  input: SetPasswordInput,
): Promise<SetPasswordResult> {
  const { newPassword, confirmPassword } = input
  const nonce = input.nonce?.trim()

  if (newPassword !== confirmPassword) return { ok: false, error: 'errors.passwordMismatch' }
  const weak = validatePasswordStrength(newPassword)
  if (weak) return { ok: false, error: weak }

  const update = await supabase.auth.updateUser({
    password: newPassword,
    data: { password_set: true },
    ...(nonce ? { nonce } : {}),
  })
  if (update.error) {
    if (!nonce && errorCode(update.error) === 'reauthentication_needed') {
      return { ok: false, needsReauth: true }
    }
    return { ok: false, error: authErrorKey(update.error) }
  }

  const signOut = await supabase.auth.signOut({ scope: 'others' })
  return { ok: true, othersSignedOut: !signOut.error }
}

/** Email the account a one-time code for setPassword()'s `nonce`. */
export async function requestReauthentication(
  supabase: SupabaseAuth,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.auth.reauthenticate()
  return error ? { ok: false, error: authErrorKey(error) } : { ok: true }
}

type UserLike =
  | {
      identities?: ReadonlyArray<{ provider?: string | null }> | null
      app_metadata?: { provider?: unknown; providers?: unknown } | null
      user_metadata?: { password_set?: unknown } | null
    }
  | null
  | undefined

/**
 * Whether this account can sign in with email + password: it signed up that
 * way, or it is an SSO account that has since set a password.
 */
export function hasPassword(user: UserLike): boolean {
  if (!user) return false
  if ((user.identities ?? []).some(i => i?.provider === 'email')) return true
  const providers = user.app_metadata?.providers
  if (Array.isArray(providers) && providers.includes('email')) return true
  if (user.app_metadata?.provider === 'email') return true
  return user.user_metadata?.password_set === true
}
