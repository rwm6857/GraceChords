// Where the app's own auth emails should land.
//
// Both paths live under /app/ and are claimed by the app as Universal Links /
// App Links, so a link the APP asked for opens the app on the device that has
// it, and falls back to the web app everywhere else (a desktop browser, a phone
// without the app, a mail client's in-app browser that does not fire App
// Links). apps/web serves both as routes for exactly that fallback.
//
// They are deliberately NOT the web app's own /reset-password and
// /auth/callback. Those are the targets of browser-initiated flows — web's
// signInWithOAuth redirects to /auth/callback — and claiming them would pull a
// browser sign-in into the app mid-handshake. See
// apps/web/public/.well-known/README.md.
//
// Kept RN-free and separate from api.ts because apiBase() THROWS when
// EXPO_PUBLIC_API_BASE_URL is unset — correct for an export, wrong here, where a
// misconfigured build should still send a working link to the production site
// rather than crash the screen.
//
// BOTH of these must be on the Supabase dashboard's Authentication → URL
// Configuration → Redirect URLs allow-list, or GoTrue silently substitutes the
// project's Site URL and the email lands on the web home page instead.

const DEFAULT_SITE_URL = 'https://gracechords.com'

export const PASSWORD_RESET_PATH = '/app/reset-password'
export const SIGNUP_CONFIRM_PATH = '/app/auth/callback'

function redirectUrl(path: string, base: string | undefined): string {
  const origin = (base || DEFAULT_SITE_URL).replace(/\/$/, '')
  return `${origin}${path}`
}

export function passwordResetRedirectUrl(
  base: string | undefined = process.env.EXPO_PUBLIC_API_BASE_URL,
): string {
  return redirectUrl(PASSWORD_RESET_PATH, base)
}

/** Where a sign-up confirmation email should land (QA report Nº 7327, S-01). */
export function signUpConfirmRedirectUrl(
  base: string | undefined = process.env.EXPO_PUBLIC_API_BASE_URL,
): string {
  return redirectUrl(SIGNUP_CONFIRM_PATH, base)
}
