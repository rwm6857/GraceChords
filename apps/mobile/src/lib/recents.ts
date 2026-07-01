import type { Song } from './useSongList'

// Local-history accessors for Home's "Continue where you left off" and "Last
// set" cards.
//
// STUBS FOR NOW — both return empty. The backing store (an on-device history of
// recently opened songs, and the user's last-used setlist) ships later with the
// Setlist Builder / local-storage layer. When it lands, implement these two
// functions against it and Home fills in with NO screen changes: Home already
// renders the Continue card only when getRecentlyOpened() has an item, and the
// Last set card only when getLastSet() is non-null.
//
// The Viewer (a later stage) should record opened songs so getRecentlyOpened()
// has data; the Setlist Builder should record the last-used set.

/** A minimal setlist summary for the "Last set" card. */
// NOTE: placeholder shape — replace/relocate this type when the real Setlist
// model arrives with the Setlist Builder.
export type Setlist = {
  id: string
  name: string
  songCount: number
  durationMin: number
  /** e.g. "G–D" for the key range badge; optional. */
  keys?: string
  updatedAt?: string
}

/** Most-recently-opened songs, newest first. Empty until the history layer ships. */
export function getRecentlyOpened(): Song[] {
  return []
}

/** The setlist the user last used/worked on, or null if none/not yet available. */
export function getLastSet(): Setlist | null {
  return null
}
