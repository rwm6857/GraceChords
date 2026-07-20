import { apiBase } from './api'

// Build the web setlist share URL that the Builder and Performer both copy.
// The web catalog is keyed by SLUG (normaliseSong maps id -> slug), so the
// link carries slugs — not the Supabase uuids — with each entry's key_override
// in the parallel `toKeys` list.
export function buildSetlistShareUrl(items: Array<{ song: { slug: string }; toKey: string | null }>): string {
  const ids = items.map((item) => encodeURIComponent(item.song.slug)).join(',')
  const keys = items.map((item) => encodeURIComponent(item.toKey || '')).join(',')
  return `${apiBase()}/setlist/${ids}?toKeys=${keys}`
}

// Build the live-session follower link shared when a leader starts a session.
// A fresh session code lives at /s/{code}; the path is deliberately NOT in the
// universal-link config, so it opens the web follower (never the app) in phase 1.
export function buildSessionShareUrl(code: string): string {
  return `${apiBase()}/s/${encodeURIComponent(code)}`
}
