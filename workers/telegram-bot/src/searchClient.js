// Talks to the bot-only Pages Functions on gracechords.com.
// All calls send Authorization: Bearer ${GRACECHORDS_API_TOKEN}.

const AUTO_PICK_THRESHOLD = 0.9
const NO_MATCH_THRESHOLD = 0.4

function authHeaders(env) {
  return { Authorization: `Bearer ${env.GRACECHORDS_API_TOKEN}` }
}

export async function searchSongs(env, query, limit = 8) {
  const url = new URL(`${env.GRACECHORDS_API_BASE}/songs/search`)
  url.searchParams.set('q', query)
  url.searchParams.set('limit', String(limit))
  const resp = await fetch(url.toString(), { headers: authHeaders(env) })
  if (!resp.ok) {
    throw new Error(`search failed: ${resp.status}`)
  }
  const data = await resp.json()
  return Array.isArray(data.results) ? data.results : []
}

export async function fetchSong(env, id) {
  const url = `${env.GRACECHORDS_API_BASE}/song/${encodeURIComponent(id)}`
  const resp = await fetch(url, { headers: authHeaders(env) })
  if (!resp.ok) {
    throw new Error(`fetchSong failed: ${resp.status}`)
  }
  const data = await resp.json()
  return data.song
}

export async function fetchSetlistSongs(env, items) {
  const resp = await fetch(`${env.GRACECHORDS_API_BASE}/setlist`, {
    method: 'POST',
    headers: { ...authHeaders(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  })
  if (!resp.ok) {
    throw new Error(`fetchSetlistSongs failed: ${resp.status}`)
  }
  const data = await resp.json()
  return Array.isArray(data.songs) ? data.songs : []
}

// Classifies search results for a single parsed query item.
// - "auto":   one clear winner (top score >= AUTO_PICK_THRESHOLD and well
//              above the runner-up, or only one above the threshold).
// - "choose": multiple plausible candidates → present a disambiguation keyboard.
// - "none":   top score too low → reply "couldn't find that".
export function classifyMatch(results) {
  if (!Array.isArray(results) || results.length === 0) {
    return { kind: 'none', candidates: [] }
  }
  const sorted = [...results].sort((a, b) => (b.match_score || 0) - (a.match_score || 0))
  const top = sorted[0]
  const second = sorted[1]

  if (top.match_score < NO_MATCH_THRESHOLD) {
    return { kind: 'none', candidates: sorted }
  }

  const aboveThreshold = sorted.filter(r => r.match_score >= AUTO_PICK_THRESHOLD)
  if (aboveThreshold.length === 1) {
    return { kind: 'auto', pick: top, candidates: sorted }
  }
  if (aboveThreshold.length === 0 && (!second || (top.match_score - second.match_score) > 0.25)) {
    // Top result dominates the runners-up; pick it without bothering the user.
    return { kind: 'auto', pick: top, candidates: sorted }
  }

  return { kind: 'choose', candidates: sorted.slice(0, 4) }
}

export const SEARCH_THRESHOLDS = { AUTO_PICK_THRESHOLD, NO_MATCH_THRESHOLD }
