// Remaps inbound deep-link / Universal Link paths to Expo Router routes.
//
// Native-only file; Expo Router ignores it on web. redirectSystemPath runs for
// every externally-launched link, on both cold start (initial === true) and warm
// start (initial === false).
//
// The mapping itself lives in src/lib/deepLinks.ts so it stays RN-free and unit
// tested; this file is only the router hook.

import { resolveDeepLinkPath } from '../src/lib/deepLinks'

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return resolveDeepLinkPath(path)
}
