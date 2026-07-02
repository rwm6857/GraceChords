import type { Song } from './useSongList'

// Local-history accessor for Home's "Continue where you left off" card.
//
// STUB FOR NOW — returns empty. The backing store (an on-device history of
// recently opened songs) ships with a later stage: the Viewer should record
// opened songs so this has data. Home already renders the Continue card only
// when there is an item, so implementing this against the history layer needs
// no screen changes.
//
// (The former getLastSet() stub was retired by the Setlist Builder — Home's
// "Last set" card now reads real Supabase data via src/lib/useLastSet.ts.)

/** Most-recently-opened songs, newest first. Empty until the history layer ships. */
export function getRecentlyOpened(): Song[] {
  return []
}
