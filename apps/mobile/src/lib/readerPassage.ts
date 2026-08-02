import { passageId, type Passage } from '@gracechords/core'

// Which of a day's readings the Reader opens on. The Daily Word landing hands
// over the tapped row as a core `passageId()` rather than a list position, so
// the Reader resolves it against its OWN expansion of the plan instead of two
// lists having to agree on ordering.
//
// Falls back to the day's first passage whenever the id is missing (the Reader
// opened as the tab root, or via the landing's list before this shipped) or
// doesn't match anything (a stale deep link, or a midnight rollover between the
// tap and the push landing the Reader on a different day's readings).
export function resolveInitialPassageIndex(passages: readonly Passage[], id?: string): number {
  if (!id) return 0
  const i = passages.findIndex((p) => passageId(p) === id)
  return i < 0 ? 0 : i
}
