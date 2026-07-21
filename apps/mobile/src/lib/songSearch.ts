import type { Song } from './useSongList'

// Shared free-text matcher for the song pickers (Setlist builder, Songbook
// builder, tablet LibraryPane, Song Library). A song matches when the query is
// a substring of its title or any of its tags — so typing a theme like
// "advent" or "communion" surfaces songs even when the word never appears in
// the title. Artist is intentionally NOT searched.
//
// `query` is expected pre-trimmed and lower-cased by the caller (each picker
// already derives it once per keystroke). A blank query never reaches here.

// Ordering rank: title matches outrank tag-only matches so an exact title stays
// at the top even when the same word also appears as a tag on other songs.
export const TITLE_MATCH = 0
export const TAG_MATCH = 1

/**
 * Match rank for ordering results, or `null` when the song does not match.
 * Lower is higher priority: title (0) before tag-only (1).
 */
export function songMatchRank(song: Song, query: string): number | null {
  if (song.title.toLowerCase().includes(query)) return TITLE_MATCH
  const tags = song.tags ?? []
  for (const tag of tags) {
    if (tag.toLowerCase().includes(query)) return TAG_MATCH
  }
  return null
}

/** Whether a song matches the query at all (title or tag). */
export function songMatchesQuery(song: Song, query: string): boolean {
  return songMatchRank(song, query) !== null
}
