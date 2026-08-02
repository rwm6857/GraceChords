// Maps an inbound deep-link / Universal Link path to an Expo Router route.
//
// The set of paths that reach here is defined by the claims in
// apps/web/public/.well-known/apple-app-site-association (iOS) and
// android.intentFilters in app.json (Android) — keep all three in sync.
//
// Direct parallels (song, session) rewrite to the app's own route name. Shared
// setlists have no direct parallel: the web link is an ephemeral payload, so
// every form lands on the import-preview screen, which decodes it, previews the
// resolved songs, and saves a copy. Web pages with no app counterpart at all
// (the blog) resolve to the home tab rather than dead-ending.
//
// Anything unrecognised passes through unchanged, which keeps internal
// gracechords:// links working.

const APP_SCHEME = 'gracechords://'

// Raw (still-encoded) query value — keep per-item encoding intact so the import
// parser can split on comma then decode each item (mirrors the web parser).
function rawParam(search: string, key: string): string {
  const m = new RegExp(`[?&]${key}=([^&]*)`).exec(search || '')
  return m ? m[1] : ''
}

export function resolveDeepLinkPath(path: string): string {
  try {
    // The custom scheme carries no real host, but URL parses the first segment
    // as one (gracechords://s/CODE -> host "s", path "/CODE"). Strip the scheme
    // so the whole remainder is read as a path.
    const href = path.startsWith(APP_SCHEME) ? `/${path.slice(APP_SCHEME.length)}` : path
    const url = new URL(href, 'https://gracechords.com')
    const seg = url.pathname.split('/').filter(Boolean)

    // Home.
    if (seg.length === 0) return '/'

    // /song/:id or /songs/:id -> /viewer/:id
    if ((seg[0] === 'song' || seg[0] === 'songs') && seg[1]) {
      const slug = decodeURIComponent(seg.slice(1).join('/'))
      return `/viewer/${encodeURIComponent(slug)}`
    }

    // /s/:code -> native live-session follower (session/[code]). Covers the
    // gracechords://s/:code custom-scheme form too, via the strip above.
    if (seg[0] === 's' && seg[1]) {
      return `/session/${encodeURIComponent(seg[1])}`
    }

    // Compact code form -> import preview.
    if (seg[0] === 'set' && seg[1]) {
      return `/setlist/import?code=${encodeURIComponent(seg[1])}`
    }
    if (seg[0] === 'worship' && seg[1] === 'set' && seg[2]) {
      return `/setlist/import?code=${encodeURIComponent(seg[2])}`
    }

    // Slug-list form -> import preview. seg[1] is the comma-joined, per-item
    // URI-encoded slug list; forward it and the raw toKeys value verbatim.
    // Skips the app's own /setlist/import. A personal /setlist/<uuid> is only
    // ever reached by in-app navigation, which never routes through here.
    if (seg[0] === 'setlist' && seg[1] && seg[1] !== 'import') {
      const toKeys = rawParam(url.search, 'toKeys')
      return `/setlist/import?ids=${seg[1]}${toKeys ? `&toKeys=${toKeys}` : ''}`
    }
    if (seg[0] === 'worship' && seg[1]) {
      const toKeys = rawParam(url.search, 'toKeys')
      return `/setlist/import?ids=${seg[1]}${toKeys ? `&toKeys=${toKeys}` : ''}`
    }

    // Index pages -> their tab. The web builder is singular, the app tab plural.
    if (seg.length === 1) {
      switch (seg[0]) {
        case 'songs':
          return '/songs'
        case 'setlist':
        case 'worship':
          return '/setlists'
        case 'reading':
          return '/daily'
        case 'songbook':
          return '/songbook'
        case 'about':
          return '/about'
        // The app has no /profile route — the profile card lives in Settings.
        case 'profile':
          return '/settings'
      }
    }

    // Blog: web-only, so send readers to the home tab instead of nowhere.
    if (seg[0] === 'posts') return '/'

    return path
  } catch {
    return path
  }
}
