// Auth orchestration for email/password and the native Apple/Google id-token
// flows. Native modules (expo-apple-authentication, expo-crypto, google-signin)
// are injected through the deps parameters — see makeAppleDeps/makeGoogleDeps in
// authDeps.ts — so this module stays importable under plain Node for the vitest
// harness. Type-only supabase imports erase at compile time.
import type { SupabaseClient } from '@supabase/supabase-js'

type SupabaseAuth = Pick<SupabaseClient, 'auth'>

export type AuthResult = {
  ok: boolean
  canceled?: boolean
  error?: string
  needsConfirmation?: boolean
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
}

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
    return { ok: false, error: 'Apple sign-in failed. Please try again.' }
  }

  if (!credential.identityToken) {
    return { ok: false, error: 'Apple did not return a credential.' }
  }

  const { data, error } = await deps.supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
  })
  if (error) return { ok: false, error: error.message }

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
}

export async function googleSignIn(deps: GoogleDeps): Promise<AuthResult> {
  let result
  try {
    deps.configure()
    result = await deps.signIn()
  } catch (e) {
    if (deps.isCancelError(e)) return { ok: false, canceled: true }
    if (deps.isPlayServicesError(e)) {
      return { ok: false, error: 'Google Play Services is unavailable on this device.' }
    }
    return { ok: false, error: 'Google sign-in failed. Please try again.' }
  }

  if (!result.idToken) {
    return { ok: false, error: 'Google did not return a credential.' }
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
  if (error) return { ok: false, error: error.message }
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
  if (error) return { ok: false, error: error.message }
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
  if (error) return { ok: false, error: error.message }
  if (data.session) return { ok: true }
  // No session: either confirm-email is on, or the email already exists (then
  // Supabase returns an obfuscated user with identities: []). Report both as
  // needsConfirmation so account existence is never leaked.
  return { ok: true, needsConfirmation: true }
}
