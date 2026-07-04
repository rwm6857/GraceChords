// Remaps inbound deep-link / Universal Link paths to Expo Router routes.
//
// Songs: the web has /song/:id and /songs/:id (id == song slug), but the app's
// song screen is viewer/[slug], so those paths are rewritten.
//
// Shared setlists: the web shares a set as an ephemeral link the app can't route
// to directly, so both forms are remapped to the import-preview screen
// (setlist/import), which decodes + previews + saves a copy:
//   - slug list:   /setlist/<slugs>?toKeys=  and  /worship/<slugs>?toKeys=
//   - compact code: /set/<CODE>              and  /worship/set/<CODE>
// /worship/* is imported as a plain setlist (we materialize a saved copy). The
// app's own /setlist/<uuid> and /setlist/import routes are left untouched.
//
// Anything unrecognised is passed through unchanged. Native-only file; Expo
// Router ignores it on web. redirectSystemPath runs for every externally-launched
// link, on both cold start (initial === true) and warm start (initial === false).

// Raw (still-encoded) query value — keep per-item encoding intact so the import
// parser can split on comma then decode each item (mirrors the web parser).
function rawParam(search: string, key: string): string {
  const m = new RegExp(`[?&]${key}=([^&]*)`).exec(search || '')
  return m ? m[1] : ''
}

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const url = new URL(path, 'https://gracechords.com')
    const seg = url.pathname.split('/').filter(Boolean)

    // /song/:id or /songs/:id -> /viewer/:id  (bare /songs falls through to the tab)
    if ((seg[0] === 'song' || seg[0] === 'songs') && seg[1]) {
      const slug = decodeURIComponent(seg.slice(1).join('/'))
      return `/viewer/${encodeURIComponent(slug)}`
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
    // Skip the app's own routes (/setlist/import, /setlist/<uuid> personal sets).
    if (seg[0] === 'setlist' && seg[1] && seg[1] !== 'import') {
      const toKeys = rawParam(url.search, 'toKeys')
      return `/setlist/import?ids=${seg[1]}${toKeys ? `&toKeys=${toKeys}` : ''}`
    }
    if (seg[0] === 'worship' && seg[1]) {
      const toKeys = rawParam(url.search, 'toKeys')
      return `/setlist/import?ids=${seg[1]}${toKeys ? `&toKeys=${toKeys}` : ''}`
    }

    return path
  } catch {
    return path
  }
}
