// POST /internal/feature — called by the GitHub Action when a PR labelled
// `post` is merged. Body is the PR title, summary, and URL; we format and
// post immediately to the dev channel.

import { sendMessage } from './telegram.js'

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
  const summary = truncate(String(body?.summary || '').trim(), 600)
  const url = String(body?.url || '').trim()

  const parts = [`<b>🚀 ${escapeHtml(title)}</b>`]
  if (summary) parts.push('', escapeHtml(summary))
  if (url) parts.push('', `<a href="${escapeHtml(url)}">Details on GitHub</a>`)

  await sendMessage(env.TELEGRAM_BOT_TOKEN, {
    chat_id: env.DEV_CHANNEL_ID,
    text: parts.join('\n'),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  })
}
