// Inbound auth helpers — webhook secret token + GitHub bearer.

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return mismatch === 0
}

// Telegram includes the secret we registered with setWebhook in this header
// on every callback. https://core.telegram.org/bots/api#setwebhook
export function verifyTelegramWebhookSecret(request, env) {
  const expected = env.TELEGRAM_WEBHOOK_SECRET
  if (!expected) return true // not configured → accept (dev mode)
  const given = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || ''
  return timingSafeEqual(given, expected)
}

export function verifyInternalBearer(request, env) {
  const expected = env.BOT_WEBHOOK_TOKEN
  if (!expected) return false
  const auth = request.headers.get('Authorization') || ''
  if (!auth.startsWith('Bearer ')) return false
  return timingSafeEqual(auth.slice(7).trim(), expected)
}
