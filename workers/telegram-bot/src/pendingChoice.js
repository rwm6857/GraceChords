// Remembers the disambiguation list the bot last offered a caller, so they
// can reply with a number (e.g. "@gracechords_bot 2") to pick one.
//
// This exists for the guest-chat flow, where replies are plain text with no
// tappable buttons. Guest Chat Mode only delivers messages that @-mention the
// bot, so the follow-up number has to carry the mention — a bare "2" never
// reaches us. The list is short-lived: stale picks are worse than a re-search.

const PENDING_CHOICE_TTL_S = 10 * 60

export async function savePendingChoice(env, scope, { items, key }) {
  if (!env.BOT_KV || !scope) return
  await env.BOT_KV.put(
    `choose:${scope}`,
    JSON.stringify({ items, key: key || '' }),
    { expirationTtl: PENDING_CHOICE_TTL_S }
  )
}

export async function loadPendingChoice(env, scope) {
  if (!env.BOT_KV || !scope) return null
  return env.BOT_KV.get(`choose:${scope}`, 'json')
}

export async function clearPendingChoice(env, scope) {
  if (!env.BOT_KV || !scope) return
  await env.BOT_KV.delete(`choose:${scope}`)
}

// Returns the 1-based number a user typed to pick from a list, or null when
// the text isn't a bare selection. Accepts "2", "#2", "2.", "2)".
export function parseSelectionNumber(text) {
  const m = String(text || '').trim().match(/^#?\s*(\d{1,2})\s*[.)]?$/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isInteger(n) && n >= 1 ? n : null
}
