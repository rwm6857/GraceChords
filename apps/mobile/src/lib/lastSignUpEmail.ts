// Remembers the address someone just signed up with, so the sign-in form can
// prefill it.
//
// Sign-up ends at the sprite picker, which shows "check your email" and sends
// the user to /login (SpritePickerScreen). AuthScreen mounts fresh there with an
// empty email field, so a user who has just typed their address is asked for it
// again the moment they come back from confirming.
//
// In memory only, and never persisted: this is a convenience inside one app run,
// not a record of who used the device. An address surviving to the next launch
// would be a small privacy leak on a shared phone for no benefit — by then the
// user is signing in normally, and the OS password manager offers the address
// anyway.
//
// Only the address. The password is deliberately NOT held anywhere: keeping a
// credential alive to save a form fill is the cheap version of auto-sign-in that
// the deep-link work exists to avoid.

let email: string | null = null

export function rememberSignUpEmail(value: string): void {
  const trimmed = value.trim()
  email = trimmed || null
}

/** Read without clearing: the sign-in form may mount more than once. */
export function getLastSignUpEmail(): string | null {
  return email
}

export function clearLastSignUpEmail(): void {
  email = null
}
