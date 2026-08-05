// Remaps inbound deep-link / Universal Link paths to Expo Router routes.
//
// Native-only file; Expo Router ignores it on web. redirectSystemPath runs for
// every externally-launched link, on both cold start (initial === true) and warm
// start (initial === false).
//
// The mapping itself lives in src/lib/deepLinks.ts so it stays RN-free and unit
// tested; this file is only the router hook.

import { router } from 'expo-router'
import { deepLinkStackRouteKey, resolveDeepLinkPath } from '../src/lib/deepLinks'
import { getFocusedRouteKey } from '../src/lib/topRoute'

export function redirectSystemPath({
  path,
  initial,
}: {
  path: string
  initial: boolean
}): string | null {
  const target = resolveDeepLinkPath(path)

  // Expo Router pushes for every inbound link, so a run of shared links stacked one
  // detail screen per tap — measured at ~6–8 MB each, with the process jettisoned at
  // ~251 MB after 15 viewer pushes (new PID, no crash report: a resource kill). That
  // is reachable by tapping several shared song links in sequence, which is exactly
  // what a reviewer verifying Universal Links does. When the link targets the route
  // that is already focused, replace it instead of stacking another copy.
  //
  // Returning null tells Expo Router we handled the navigation ourselves: it only
  // dispatches for a truthy return (the `if (href)` guard in expo-router's
  // link/linking.ts subscribe(), and the same guard in getLinkingConfig's
  // getInitialURL).
  //
  // `initial` is a cold start, where the stack cannot already hold the target, so it
  // keeps the plain push. In-app navigation never reaches this file at all, so every
  // router.push to a viewer or a setlist is untouched.
  const key = deepLinkStackRouteKey(target)
  if (!initial && key !== null && key === getFocusedRouteKey()) {
    router.replace(target as Parameters<typeof router.replace>[0])
    return null
  }

  return target
}
