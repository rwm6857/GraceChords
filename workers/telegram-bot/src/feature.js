// POST /internal/feature — called by the GitHub Action when a PR labelled
// `post` is merged, or when its title/body contains "#post". Body is the
// PR title, summary, and URL. We rewrite the summary through Workers AI
// for a friendlier, end-user-facing tone, then post to the dev channel.
// If the AI call fails for any reason we fall back to the raw summary so
// a deploy or AI outage never silently drops the announcement.

import { sendMessage } from './telegram.js'
import { summarizeFeature } from './aiSummary.js'

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function truncate(s, max) {
  if (!s) return ''
  if (s.length <= max) return s
  return s.slice(0, max - 1).trimEnd() + '…'
}

export async function postFeature(env, body) {
  if (!env.DEV_CHANNEL_ID || !env.TELEGRAM_BOT_TOKEN) {
    throw new Error('Bot not configured')
  }
  const title = String(body?.title || '').trim()
  if (!title) {
    throw new Error('title required')
  }
  const rawSummary = String(body?.summary || '').trim()
  const url = String(body?.url || '').trim()

  // Try AI rewrite first. summarizeFeature() returns HTML-escaped text or
  // null. Any thrown error (rate limit, quota, transient) → fall back.
  let aiBody = null
  try {
    aiBody = await summarizeFeature(env, { title, summary: rawSummary })
  } catch (err) {
    console.warn('AI summary failed; falling back to raw body', err?.message || err)
  }

  const parts = [`<b>🚀 ${escapeHtml(title)}</b>`]
  if (aiBody) {
    parts.push('', aiBody)
  } else if (rawSummary) {
    parts.push('', escapeHtml(truncate(rawSummary, 600)))
  }
  if (url) parts.push('', `<a href="${escapeHtml(url)}">Details on GitHub</a>`)

  await sendMessage(env.TELEGRAM_BOT_TOKEN, {
    chat_id: env.DEV_CHANNEL_ID,
    text: parts.join('\n'),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  })
}
