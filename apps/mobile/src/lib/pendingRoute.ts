// Keeps a deep link's destination alive across the sign-in detour.
//
// The auth gate in app/_layout.tsx redirects a signed-out user to /login, and
// until now it simply threw the destination away: a worship leader sharing a
// song or a set link with a teammate who is not signed in — or does not have an
// account yet — sent them to a login screen and then to Home, with no sign of
// what the link was for. Every shared-link feature in the app has this hole.
//
// Two values, because "the last link that arrived" and "a link the gate took
// away from the user" are different things, and only the second should ever be
// resumed:
//
//   inbound — written by app/+native-intent.tsx for every externally-opened
//             link, discarded as soon as the gate lets any route render. It is
//             a one-pass hand-off, not a history.
//   held    — promoted from `inbound` at the exact moment the gate discards a
//             route, and consumed once when the user lands after signing in.
//
// Without that split, a link opened while signed IN would still be sitting in
// the module when the user later signed out, and the next sign-in would resume
// a destination they had already seen.
//
// In memory only, like topRoute.ts, and for the same reason: this is a hand-off
// between +native-intent.tsx (which runs outside React) and the root layout,
// both inside a single app run. Persisting it would mean a link tapped and
// abandoned today could reopen itself on an unrelated launch next week.

let inbound: string | null = null
let held: string | null = null

/** Record an externally-opened link's resolved target. */
export function noteInboundLink(target: string): void {
  inbound = target
}

/**
 * Promote the inbound link to "held" — call this where a route is discarded in
 * favour of /login, so that only a destination the user actually lost is kept.
 */
export function holdInboundLink(): void {
  held = inbound
  inbound = null
}

/** Drop a link the gate did not need to discard. */
export function clearInboundLink(): void {
  inbound = null
}

/** Read and clear the held destination. Consumed once, then gone. */
export function takeHeldLink(): string | null {
  const target = held
  held = null
  return target
}

/** Test-only reset so each test starts from a clean module state. */
export function __resetPendingRouteForTest(): void {
  inbound = null
  held = null
}
