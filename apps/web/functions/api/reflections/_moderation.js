// Reflections moderation pipeline. `moderateText(body, env) -> { allowed, reasons[] }`.
//
// Two layers, run in order:
//   Layer 1 (local, no network): length bounds, URL reject, blocklist reject.
//     Cheap and runs FIRST so an obvious violation never spends an API call.
//   Layer 2 (AI): OpenAI Moderation (omni-moderation-latest); reject on any
//     flagged category.
//
// Providers sit behind a registry so a second provider (e.g. Gemini) can be
// added later as config, not a rewrite — only 'openai' is wired in this phase.
//
// FAIL CLOSED: any AI provider error throws ModerationUnavailable, which the
// submit endpoint turns into a 503 with a retry-able message. Text is NEVER
// inserted when moderation could not run. The module is pure (no Cloudflare
// globals) so it unit-tests headless with an injected `fetch`.

import { BLOCKLIST } from './_blocklist.js'

export const MIN_LEN = 1
export const MAX_LEN = 2000

// Thrown when the AI layer cannot render a verdict (network/API error). The
// caller must fail closed (reject + retry), never fall through to "allowed".
export class ModerationUnavailable extends Error {
  constructor(message = 'Moderation service unavailable') {
    super(message)
    this.name = 'ModerationUnavailable'
  }
}

// URLs / bare domains aren't allowed in reflections (spam/link vector). Matches
// http(s):// and www. prefixes plus bare "example.com/…" style domains.
const URL_RE =
  /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?/i

// Light leetspeak fold so "sh1t"/"f@ck" still hit the blocklist. Applied only
// for MATCHING; the stored body is never altered.
function normalizeForMatch(s) {
  return s
    .toLowerCase()
    .replace(/[0]/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[4@]/g, 'a')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't')
}

const BLOCKLIST_RES = BLOCKLIST.map(
  (term) => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
)

/**
 * Layer 1 — pure local checks. No network. Returns { allowed, reasons[] }.
 * @param {string} body
 */
export function localModeration(body) {
  const reasons = []
  const text = typeof body === 'string' ? body.trim() : ''

  if (text.length < MIN_LEN) reasons.push('empty')
  if (text.length > MAX_LEN) reasons.push('too_long')
  if (URL_RE.test(text)) reasons.push('contains_url')

  const normalized = normalizeForMatch(text)
  if (BLOCKLIST_RES.some((re) => re.test(normalized))) reasons.push('blocklisted_term')

  return { allowed: reasons.length === 0, reasons }
}

/**
 * Layer 2 — OpenAI Moderation. Rejects on any flagged category. Throws
 * ModerationUnavailable on API/network error (fail closed).
 * @param {string} body
 * @param {{ OPENAI_API_KEY?: string }} env
 * @param {typeof fetch} [fetchImpl] injectable for tests
 */
export async function openaiModeration(body, env, fetchImpl = fetch) {
  if (!env?.OPENAI_API_KEY) throw new ModerationUnavailable('OPENAI_API_KEY not configured')

  let resp
  try {
    resp = await fetchImpl('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'omni-moderation-latest', input: body }),
    })
  } catch (err) {
    throw new ModerationUnavailable(`Moderation request failed: ${err?.message || err}`)
  }
  if (!resp.ok) throw new ModerationUnavailable(`Moderation API returned ${resp.status}`)

  let data
  try {
    data = await resp.json()
  } catch {
    throw new ModerationUnavailable('Moderation API returned invalid JSON')
  }
  const result = Array.isArray(data?.results) ? data.results[0] : null
  if (!result) throw new ModerationUnavailable('Moderation API returned no result')

  if (result.flagged) {
    const reasons = Object.entries(result.categories || {})
      .filter(([, on]) => on)
      .map(([cat]) => `openai:${cat}`)
    return { allowed: false, reasons: reasons.length ? reasons : ['openai:flagged'] }
  }
  return { allowed: true, reasons: [] }
}

// Provider registry — add 'gemini' here later without touching moderateText().
const PROVIDERS = { openai: openaiModeration }

/**
 * Full pipeline: Layer 1 local, then the configured AI provider. Returns the
 * first failing layer's verdict; throws ModerationUnavailable if the AI layer
 * cannot run (caller fails closed).
 * @param {string} body
 * @param {object} env  Cloudflare env (OPENAI_API_KEY, optional MODERATION_PROVIDER)
 * @param {typeof fetch} [fetchImpl]
 */
export async function moderateText(body, env, fetchImpl = fetch) {
  const local = localModeration(body)
  if (!local.allowed) return local

  const providerName = env?.MODERATION_PROVIDER || 'openai'
  const provider = PROVIDERS[providerName]
  if (!provider) throw new ModerationUnavailable(`Unknown moderation provider: ${providerName}`)
  return provider(body, env, fetchImpl)
}
