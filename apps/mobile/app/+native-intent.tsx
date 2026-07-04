// Remaps inbound deep-link / Universal Link paths to Expo Router routes.
//
// Songs only today: the web has /song/:id and /songs/:id (id == song slug), but the
// app's song screen is viewer/[slug], so those paths must be rewritten. Shared-setlist
// links (/setlist, /set, /worship) are excluded in the web AASA and fall back to the
// web app until the app can decode the ephemeral slug-list payloads — see
// apps/web/public/.well-known/README.md (TODO(setlist)). Anything unrecognised is passed
// through unchanged. Native-only file; Expo Router ignores it on web.
//
// redirectSystemPath runs for every externally-launched link, on both cold start
// (initial === true) and warm start (initial === false).
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const url = new URL(path, 'https://gracechords.com')
    const seg = url.pathname.split('/').filter(Boolean)
    // /song/:id or /songs/:id -> /viewer/:id  (bare /songs falls through to the tab)
    if ((seg[0] === 'song' || seg[0] === 'songs') && seg[1]) {
      const slug = decodeURIComponent(seg.slice(1).join('/'))
      return `/viewer/${encodeURIComponent(slug)}`
    }
    return path
  } catch {
    return path
  }
}
