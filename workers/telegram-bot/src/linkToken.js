// Short-lived account-link tokens for the mobile "Link Telegram" flow.
//
// The app asks the web API for a token, opens https://t.me/<bot>?start=<token>,
// and the user taps START. Telegram hands the token to /start, which is the only
// way the bot learns which GraceChords account the sender belongs to.
//
// TELEGRAM'S START PAYLOAD IS CAPPED AT 64 CHARACTERS AND RESTRICTED TO THE
// ALPHABET [A-Za-z0-9_-]. 32 random bytes encoded as base64url WITHOUT PADDING
// is exactly 43 characters drawn from precisely that alphabet, so it fits with
// room for the caller to prefix if that is ever needed.
//
// Do not "simplify" the encoding:
//   - hex would be 64 characters — exactly at the limit, no headroom;
//   - standard base64 emits '+', '/' and '=', all outside the permitted set;
//   - anything JSON-shaped blows the budget immediately.
// Telegram does not reject an over-long or out-of-alphabet start parameter with
// an error. It truncates or drops it, so the failure appears as "linking just
// doesn't work" for real users and never once in local testing.

const TOKEN_BYTES = 32
const TTL_SECONDS = 10 * 60

// The exact shape mintTokenValue produces: 32 bytes → 43 base64url characters.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

const keyFor = (token) => `linktok:${token}`

function base64url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function mintTokenValue() {
  return base64url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)))
}

/** Mint a token for `userId` and stash it in KV under a 10-minute TTL. */
export async function createLinkToken(env, userId) {
  if (!env.BOT_KV) throw new Error('BOT_KV is not bound')
  const token = mintTokenValue()
  await env.BOT_KV.put(keyFor(token), String(userId), { expirationTtl: TTL_SECONDS })
  return token
}

/**
 * Exchange a token for the user id it was minted for, deleting it so it cannot
 * be reused.
 *
 * KV is eventually consistent, so the delete leaves a replay window on the order
 * of a minute. That is accepted, not engineered around: the token already
 * expires in ten minutes, it is delivered over Telegram's own transport to a
 * chat the recipient controls, and the alternatives (a Durable Object, or a
 * Postgres row plus a migration) are a large amount of machinery for a
 * ten-minute secret.
 */
export async function redeemLinkToken(env, token) {
  if (!env.BOT_KV) return null
  if (!looksLikeLinkToken(token)) return null
  const key = keyFor(token)
  const userId = await env.BOT_KV.get(key)
  if (!userId) return null
  await env.BOT_KV.delete(key)
  return userId
}

/**
 * Shape check before touching KV, so a junk or hand-typed /start payload never
 * becomes a lookup. A bare `/start` has no payload at all and must keep its
 * existing welcome behaviour — callers check this first and fall through.
 */
export function looksLikeLinkToken(value) {
  return typeof value === 'string' && TOKEN_PATTERN.test(value)
}

/** The deep link the app opens. `t.me` is a Telegram universal link: it opens
 * the installed app directly and falls back to the web client otherwise, so no
 * `tg://` probe (and no LSApplicationQueriesSchemes entry) is needed. */
export function linkUrlFor(botUsername, token) {
  return `https://t.me/${botUsername}?start=${token}`
}
