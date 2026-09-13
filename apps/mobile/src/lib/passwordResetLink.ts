// Where a password-reset email should land.
//
// The reset itself happens on the WEB (apps/web ResetPasswordPage, route
// /reset-password), which already handles the PASSWORD_RECOVERY event and the
// expired-link state. The app only requests the email.
//
// Kept RN-free and separate from api.ts because apiBase() THROWS when
// EXPO_PUBLIC_API_BASE_URL is unset — correct for an export, wrong here, where a
// misconfigured build should still send a working link to the production site
// rather than crash the screen.
//
// Whatever this resolves to must also be on the Supabase dashboard's
// Authentication → URL Configuration → Redirect URLs allow-list, or GoTrue
// silently substitutes the project's Site URL.

const DEFAULT_SITE_URL = 'https://gracechords.com'

export const PASSWORD_RESET_PATH = '/reset-password'

export function passwordResetRedirectUrl(
  base: string | undefined = process.env.EXPO_PUBLIC_API_BASE_URL,
): string {
  const origin = (base || DEFAULT_SITE_URL).replace(/\/$/, '')
  return `${origin}${PASSWORD_RESET_PATH}`
}
