// One formatter for every place a song's key is printed in a LIST or a CARD.
//
// The rule (QA report Nº 7327, S-02): a key slot shows the song's identity key
// — its `default_key` — and, when a stored working key differs, renders the
// pair as "orig → work". A song therefore always reads as itself, and a
// transposition is visible rather than silently replacing the key. Before this,
// Home's Continue card printed the original while its Recent-songs card printed
// the working key, for the same song, from the same array.
//
// Two different "working keys" feed this, and both come through here:
//   • recents.lastKey — the key the Viewer was last left in (device-local,
//     AsyncStorage, not synced). Written by recents.ts.
//   • a setlist entry's toKey — a set-scoped override (Supabase), already
//     resolved against the song by core's effectiveKey(entry, song).
//
// NOT for live controls. The Song Viewer, Performer and session-follower
// headers show the sounding key ALONE: next to a transpose control, the key
// printed must be the one you are playing. Those three stay as they are.
//
// No `chordStyle` parameter, on purpose. Solfège display is a Viewer-scoped
// preference (ViewOptionsSheet) that has never applied to list rows — threading
// it in here would silently restyle every key on Home, Library and the setlist
// screens, which is a different change than the one this is for.

type Translator = (key: string, options?: Record<string, unknown>) => string

export type KeyDisplay = {
  /** What to render. */
  text: string
  /** What a screen reader should say instead — "→" does not read aloud well. */
  a11yLabel: string
}

/** Treat "", "   " and null alike: a key we do not have. */
function clean(key: string | null | undefined): string | null {
  const trimmed = typeof key === 'string' ? key.trim() : ''
  return trimmed || null
}

/**
 * Render a song's key, showing a transposition as a modifier when there is one.
 *
 * Returns null when there is no key to show at all, so a caller can drop the
 * whole slot rather than render an empty chip.
 */
export function formatKeyPair(
  original: string | null | undefined,
  working: string | null | undefined,
  tx: Translator,
): KeyDisplay | null {
  const from = clean(original)
  const to = clean(working)

  if (!from && !to) return null

  // One key to show: no transposition, or a working key whose original we do
  // not know (which cannot honestly be rendered as a pair — there is no "from").
  if (!from || !to || from === to) {
    const key = (from ?? to) as string
    return { text: key, a11yLabel: tx('common:keyOf', { key }) }
  }

  return {
    text: tx('common:keyTransposed', { from, to }),
    a11yLabel: tx('common:keyTransposedA11y', { from, to }),
  }
}
