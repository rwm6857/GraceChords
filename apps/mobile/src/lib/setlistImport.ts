import { decodeSet } from '@gracechords/core'
import type { Song } from './useSongList'

// Decode + resolve a SHARED setlist link into songs the current user can import
// (materialize as their own saved copy). Two link forms are supported:
//
//   - Slug-list (what the web app actually emits):
//       /setlist/<slug1>,<slug2>?toKeys=<k1>,<k2>   (and the /worship/... mirror)
//     ids are song slugs; toKeys are literal key names, each URI-encoded per
//     item, comma-joined, aligned by index; an empty key = the song's native
//     key. Mirrors the web parser in apps/web/src/pages/SetlistPage.jsx.
//   - Compact code (decode-only; no live web UI emits it, but /set/<CODE> and
//       /worship/set/<CODE> decode through core's setcode codec).
//
// The song catalog is a single shared library visible to every user, so slugs
// normally resolve; misses (stale link / catalog skew / malformed link) are the
// rare exception and are collected separately — this never throws on a miss.

// Shared links never carry a title (the web share URL is only slugs + toKeys),
// so the imported copy lands with this placeholder that the user can rename in
// the builder.
export const DEFAULT_IMPORT_NAME = 'Imported setlist'

export type ImportedEntry = { slug: string; toKey: string | null }
export type ResolvedEntry = { song: Song; toKey: string | null }
export type ImportResolution = { resolved: ResolvedEntry[]; unresolved: string[] }

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** Parse the slug-list form into slug + per-song key entries. */
export function parseSlugForm(idsParam: string, toKeysParam: string): ImportedEntry[] {
  const ids = String(idsParam || '')
    .split(',')
    .map((s) => safeDecode(s.trim()))
    .filter(Boolean)
  // Keys are aligned by index and NOT filtered — an empty slot means "native key".
  const keys = String(toKeysParam || '')
    .split(',')
    .map((s) => safeDecode(s))
  return ids.map((slug, i) => ({ slug, toKey: keys[i] || null }))
}

/**
 * Parse the compact code form via core's decodeSet. The web generated these
 * codes by hashing the web catalog id, which IS the song slug, so key the
 * catalog by slug here to match. decodeSet yields { id: slug, toKey: keyName };
 * non-song entries (Bible verses) return ids that match no slug and simply fall
 * through to "unresolved". A malformed code decodes to an empty list.
 */
export function parseCodeForm(code: string, songs: Song[]): ImportedEntry[] {
  const catalogBySlug = (songs || []).map((s) => ({ id: s.slug }))
  const res = decodeSet(catalogBySlug, code)
  if (!res || res.error) return []
  return (res.entries || []).map((e: { id: string; toKey: string }) => ({
    slug: String(e.id),
    toKey: e.toKey || null,
  }))
}

/**
 * Best-effort display name for a slug: "amazing-grace" -> "Amazing Grace".
 * Opaque ids (Bible-verse ids contain ':', anything with no letters) have no
 * sensible name and return '' so the warning falls back to a count.
 */
export function deslugify(slug: string): string {
  const s = String(slug || '')
  if (!s || s.includes(':')) return ''
  const words = s.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!/[a-zA-Z]/.test(words)) return ''
  return words.replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Resolve decoded entries against the shared catalog. Hits keep their imported
 * key override; misses are collected as best-effort display names ('' when none
 * can be derived) for the warning.
 */
export function resolveEntries(entries: ImportedEntry[], songs: Song[]): ImportResolution {
  const bySlug = new Map((songs || []).map((s) => [s.slug, s]))
  const resolved: ResolvedEntry[] = []
  const unresolved: string[] = []
  for (const e of entries) {
    const song = bySlug.get(e.slug)
    if (song) resolved.push({ song, toKey: e.toKey })
    else unresolved.push(deslugify(e.slug))
  }
  return { resolved, unresolved }
}

function joinAnd(list: string[]): string {
  if (list.length <= 1) return list[0] || ''
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
}

/**
 * Grammatically-correct warning naming the dropped song(s). `unresolved` holds a
 * best-effort display name per miss, or '' where none could be derived. Returns
 * null when nothing is missing. Never produces "1 songs".
 */
export function buildMissingWarning(unresolved: string[]): string | null {
  const n = unresolved.length
  if (n === 0) return null
  const named = unresolved.filter(Boolean)
  if (named.length === 0) {
    return `${n} ${n === 1 ? 'song' : 'songs'} could not be found.`
  }
  const shown = named.slice(0, 2)
  const others = n - shown.length
  const subject =
    others === 0
      ? joinAnd(shown)
      : `${shown.join(', ')} and ${others} ${others === 1 ? 'other' : 'others'}`
  return `${subject} could not be found.`
}

/**
 * The song rows to persist, in the normal setlist-creation shape: `id` is the
 * Supabase song uuid (NOT the slug), `toKey` the per-entry key override (null =
 * native key). Unresolved entries are already excluded from `resolved`.
 */
export function buildSavePayload(
  resolved: ResolvedEntry[],
): Array<{ id: string; toKey: string | null }> {
  return resolved.map((r) => ({ id: r.song.id, toKey: r.toKey || null }))
}

/**
 * Single entrypoint for the screen. `code` wins when present (compact form),
 * otherwise the slug-list form is parsed. Resolution needs the loaded catalog.
 */
export function resolveImport(
  params: { ids?: string; toKeys?: string; code?: string },
  songs: Song[],
): ImportResolution {
  const entries = params.code
    ? parseCodeForm(params.code, songs)
    : parseSlugForm(params.ids || '', params.toKeys || '')
  return resolveEntries(entries, songs)
}
