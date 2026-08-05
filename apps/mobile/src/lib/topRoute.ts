// Mirror of the focused Expo Router route, written from the root layout's existing
// useSegments() read (app/_layout.tsx).
//
// app/+native-intent.tsx runs OUTSIDE React — Expo Router calls it from the Linking
// 'url' listener — so it cannot read navigation state through a hook, and Expo Router
// exposes no imperative getter for the current route. This one-value mirror is the
// seam that lets the deep-link hook see what is already on screen.
//
// The key format is the route's segments joined by '/', matching the keys returned by
// deepLinkStackRouteKey in deepLinks.ts ('viewer/[slug]', 'setlist/import',
// 'session/[code]'). useSegments() yields the route pattern, not resolved params, so
// two different songs both read as 'viewer/[slug]' — which is exactly the comparison
// the deep-link hook needs.
let focusedRouteKey: string | null = null

export function setFocusedRouteKey(key: string | null): void {
  focusedRouteKey = key
}

export function getFocusedRouteKey(): string | null {
  return focusedRouteKey
}
