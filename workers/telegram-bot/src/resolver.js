// Multi-song resolution state machine.
//
// A request parses into an ordered list of items (one per song). Each item is
// resolved to a concrete song — usually automatically, but when a title is
// ambiguous the bot pauses, asks the user to disambiguate, and stashes its
// progress in BOT_KV. A button tap (DM/group) or a numbered reply (guest)
// resumes from where it left off, so the WHOLE setlist still gets delivered
// after the user clears up a confusing title — not just the one song.
//
// State is short-lived: a stale half-built setlist is worse than re-asking.

import { searchSongs, classifyMatch } from './searchClient.js'

const RESOLVE_TTL_S = 10 * 60

export async function saveResolution(env, scope, state) {
  if (!env.BOT_KV || !scope) return
  await env.BOT_KV.put(`resolve:${scope}`, JSON.stringify(state), {
    expirationTtl: RESOLVE_TTL_S,
  })
}

export async function loadResolution(env, scope) {
  if (!env.BOT_KV || !scope) return null
  return env.BOT_KV.get(`resolve:${scope}`, 'json')
}

export async function clearResolution(env, scope) {
  if (!env.BOT_KV || !scope) return
  await env.BOT_KV.delete(`resolve:${scope}`)
}

// Returns the 1-based number a user typed to pick from a list, or null when
// the text isn't a bare selection. Accepts "2", "#2", "2.", "2)".
export function parseSelectionNumber(text) {
  const m = String(text || '').trim().match(/^#?\s*(\d{1,2})\s*[.)]?$/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isInteger(n) && n >= 1 ? n : null
}

// Resolve items starting at picks.length, pushing auto-matched picks onto
// `picks` (which it mutates). Stops and returns at the first item that needs
// the user, or when everything is resolved:
//   { status: 'done' }
//   { status: 'choose', index, item, candidates }
//   { status: 'none', index, item }
export async function advanceResolution(env, items, picks) {
  for (let i = picks.length; i < items.length; i++) {
    const item = items[i]
    const results = await searchSongs(env, item.title).catch(() => [])
    const classified = classifyMatch(results, item.title)
    if (classified.kind === 'none') {
      return { status: 'none', index: i, item }
    }
    if (classified.kind === 'choose') {
      return { status: 'choose', index: i, item, candidates: classified.candidates }
    }
    picks.push({ id: classified.pick.id, key: item.key || classified.pick.default_key || '' })
  }
  return { status: 'done' }
}

// Record a disambiguation choice and append it to picks. `candidate` is one of
// the stored candidate objects; the key comes from the original item (so an
// explicit "in G" survives) or the song's default key.
export function applyChoice(state, candidate) {
  const idx = state.picks.length
  const key = (state.items[idx] && state.items[idx].key) || candidate.default_key || ''
  state.picks.push({ id: candidate.id, key })
}

// Trim a search result down to the fields the resolver needs to persist.
export function toCandidate(c) {
  return { id: c.id, title: c.title, artist: c.artist || '', default_key: c.default_key || '' }
}
