// Auth orchestration for email/password and the native Apple/Google id-token
// flows. Native modules (expo-apple-authentication, expo-crypto, google-signin)
// are injected through the deps parameters — see makeAppleDeps/makeGoogleDeps in
// authDeps.ts — so this module stays importable under plain Node for the vitest
// harness. Type-only supabase imports erase at compile time.
import type { SupabaseClient } from '@supabase/supabase-js'
import { authErrorKey } from '@gracechords/core'

type SupabaseAuth = Pick<SupabaseClient, 'auth'>

export type AuthResult = {
  ok: boolean
  canceled?: boolean
  /**
   * ALWAYS an auth-namespace i18n key (errors.*) — this module's own failures
   * and, via authErrorKey(), every provider failure too. Never a raw Supabase
   * message: the screen renders it with plain t(), so a non-key would display
   * as the key itself rather than leaking GoTrue's wording.
   */
  error?: string
  /**
   * Interpolation values for `error`, merged into the t() call by the screen.
   * Only ever bounded, non-sensitive values — a provider status code, a count —
   * never a raw provider message: `error` exists precisely so GoTrue's wording
   * cannot reach a user, and this must not be the hole in that.
   */
  errorParams?: Record<string, string | number>
  needsConfirmation?: boolean
}

/**
 * Diagnostics hooks, injected like the rest of the native surface.
 *
 * Both are OPTIONAL so the vitest harness (and any caller that does not care)
 * can build a deps object without them. `describeError` pulls the provider's
 * code/status out of the thrown value; `logFailure` records it. Keeping them
 * here rather than importing a logger preserves this module's contract: RN-free
 * and importable under plain Node.
 */
type DiagnosticsDeps = {
  describeError?: (e: unknown) => { code: string | null; status: number | null; message: string }
  logFailure?: (
    scope: string,
    info: { code: string | null; status: number | null; message: string },
  ) => void
}

/**
 * Describe and log a provider failure, and hand the description back so the
 * caller can reuse a code it needs in user-facing copy.
 *
 * Returns null when no `describeError` dep was injected — there is then nothing
 * to log and nothing to interpolate.
 */
function logProviderFailure(
  deps: DiagnosticsDeps,
  scope: string,
  e: unknown,
): { code: string | null; status: number | null; message: string } | null {
  const info = deps.describeError?.(e)
  if (!info) return null
  deps.logFailure?.(scope, info)
  return info
}

export type AppleDeps = {
  supabase: SupabaseAuth
  // Wraps AppleAuthentication.signInAsync; the deps layer passes
  // requestedScopes (FULL_NAME, EMAIL) itself and forwards the hashed nonce.
  signInAsync: (hashedNonce: string) => Promise<{
    identityToken: string | null
    fullName?: { givenName?: string | null; familyName?: string | null } | null
  }>
  sha256: (value: string) => Promise<string>
  randomUUID: () => string
  isCancelError: (e: unknown) => boolean
} & DiagnosticsDeps

// Apple requires the SHA-256 of the nonce in the credential request, while
// Supabase must receive the RAW nonce to verify the token's nonce claim.
export async function appleSignIn(deps: AppleDeps): Promise<AuthResult> {
  const rawNonce = deps.randomUUID()
  const hashedNonce = await deps.sha256(rawNonce)

  let credential
  try {
    credential = await deps.signInAsync(hashedNonce)
  } catch (e) {
    if (deps.isCancelError(e)) return { ok: false, canceled: true }
    // Dismissing the sheet is a choice, not a failure, so it is excluded above.
    // Everything past it is worth a diagnostic — the friendly copy below is the
    // same string for every cause.
    logProviderFailure(deps, 'appleSignIn', e)
    return { ok: false, error: 'errors.appleFailed' }
  }

  if (!credential.identityToken) {
    return { ok: false, error: 'errors.appleNoCredential' }
  }

  const { data, error } = await deps.supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
  })
  if (error) return { ok: false, error: authErrorKey(error) }

  // Apple only includes the user's name on the FIRST authorization; persist it
  // to user_metadata.full_name (which getDisplayName in greetings.ts reads) or
  // it is lost for every later sign-in.
  const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
    .filter(Boolean)
    .join(' ')
    .trim()
  const existing = (data.user?.user_metadata as Record<string, unknown> | undefined)?.full_name
  if (fullName && !existing) {
    await deps.supabase.auth.updateUser({ data: { full_name: fullName } })
  }

  return { ok: true }
}

export type GoogleDeps = {
  supabase: SupabaseAuth
  // GoogleSignin.configure({ webClientId, iosClientId }) — must run before signIn.
  configure: () => void
  // Wraps GoogleSignin.signIn(); the deps layer normalizes the v13+ response
  // shape ({ type, data }) down to { idToken } and rethrows coded errors.
  signIn: () => Promise<{ idToken: string | null }>
  isCancelError: (e: unknown) => boolean
  isPlayServicesError: (e: unknown) => boolean
  // True for the native DEVELOPER_ERROR (Android status code 10): the app's
  // package name + signing SHA-1 are not registered against an Android OAuth
  // client in the same Google Cloud project as webClientId. The account picker
  // still appears, then sign-in fails right after selection.
  isConfigError: (e: unknown) => boolean
} & DiagnosticsDeps

export async function googleSignIn(deps: GoogleDeps): Promise<AuthResult> {
  let result
  try {
    deps.configure()
    result = await deps.signIn()
  } catch (e) {
    if (deps.isCancelError(e)) return { ok: false, canceled: true }
    // Log BEFORE a friendly string is chosen. From here on the provider's own
    // code is discarded, and it is the only thing that tells these failures
    // apart — QA report Nº 7327 could report the sentence but not the number.
    const info = logProviderFailure(deps, 'googleSignIn', e)
    if (deps.isPlayServicesError(e)) {
      return { ok: false, error: 'errors.googlePlayUnavailable' }
    }
    // A misconfigured Android OAuth client (missing SHA-1) surfaces here rather
    // than as a network/cancel error; report it distinctly so the failure is
    // diagnosable instead of the generic "please try again".
    if (deps.isConfigError(e)) {
      return {
        ok: false,
        error: 'errors.googleConfigError',
        // isConfigError gates on code '10' (Android CommonStatusCodes
        // .DEVELOPER_ERROR), so that is what got us here; the literal is only
        // reached when no describeError dep was injected.
        errorParams: { code: info?.code ?? '10' },
      }
    }
    return { ok: false, error: 'errors.googleFailed' }
  }

  if (!result.idToken) {
    return { ok: false, error: 'errors.googleNoCredential' }
  }

  // No nonce is passed here — unlike Apple. On iOS the native Google SDK embeds
  // its own nonce claim in the id_token, but the FREE @react-native-google-signin
  // cannot supply/read a matching raw nonce (custom nonce is a paid feature). So
  // the Google provider MUST have "Skip nonce checks" enabled in the Supabase
  // dashboard (Auth -> Providers -> Google); otherwise Supabase rejects the token
  // with "Passed nonce and nonce in id_token should either both exist or not."
  // Do not add a `nonce` here expecting parity with appleSignIn — it would not match.
  const { error } = await deps.supabase.auth.signInWithIdToken({
    provider: 'google',
    token: result.idToken,
  })
  if (error) return { ok: false, error: authErrorKey(error) }
  return { ok: true }
}

export async function emailSignIn(
  supabase: SupabaseAuth,
  input: { email: string; password: string },
): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithPassword({
    email: input.email.trim(),
    password: input.password,
  })
  if (error) return { ok: false, error: authErrorKey(error) }
  return { ok: true }
}

export async function emailSignUp(
  supabase: SupabaseAuth,
  input: { fullName: string; email: string; password: string },
): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: { data: { full_name: input.fullName.trim() } },
  })
  if (error) return { ok: false, error: authErrorKey(error) }
  if (data.session) return { ok: true }
  // No session: either confirm-email is on, or the email already exists (then
  // Supabase returns an obfuscated user with identities: []). Report both as
  // needsConfirmation so account existence is never leaked.
  return { ok: true, needsConfirmation: true }
}

/**
 * Request a password-reset email.
 *
 * ALWAYS reports success to the caller when the request itself went through,
 * regardless of whether an account exists — Supabase deliberately returns 200
 * either way, and branching on the response would turn this screen into an
 * account-existence oracle. The ONLY failures reported are ones that say nothing
 * about the address: a throttle and a dead network.
 *
 * `redirectTo` is the WEB reset page (apps/web ResetPasswordPage), not an app
 * route — the user requests the reset in the app and completes it in a browser.
 * It must also be on the Supabase dashboard's redirect allow-list.
 */
export async function requestPasswordReset(
  supabase: SupabaseAuth,
  input: { email: string; redirectTo: string },
): Promise<AuthResult> {
  const { error } = await supabase.auth.resetPasswordForEmail(input.email.trim(), {
    redirectTo: input.redirectTo,
  })
  if (error) {
    const key = authErrorKey(error)
    // Anything else — an unknown email, a malformed one, a provider hiccup — is
    // swallowed on purpose so the confirmation copy stays uniform.
    if (key === 'errors.rateLimited' || key === 'errors.network') {
      return { ok: false, error: key }
    }
  }
  return { ok: true }
}
