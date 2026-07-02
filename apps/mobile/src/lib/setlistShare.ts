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
