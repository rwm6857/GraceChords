// POST /internal/feature — called by the GitHub Action on merged PRs that
// pass the workflow's gating (feat-prefix, or "#post" override). Body is
// the PR title, summary, and URL.
//
// Behaviour:
//   - The conventional-commit prefix (e.g. "feat(scope):") is stripped from
//     the title before anything is posted to end users.
//   - If the PR body is empty, the post is skipped entirely. Empty bodies
//     produced uselessly generic AI summaries; we'd rather say nothing.
//   - Otherwise the body is rewritten by Workers AI for a friendlier tone.
//     Any AI failure falls back to the raw body (truncated) so an outage
//     never silently drops a real announcement.

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

// Strip the conventional-commit prefix (type, optional scope, optional
// breaking "!") so end users see "Setlist sharing" instead of
// "feat(setlist)!: setlist sharing". The recognised types match the
// Angular / conventional-commits spec; anything unrecognised is left as-is.
const CC_PREFIX = /^(feat|fix|chore|refactor|docs|style|test|ci|build|perf|revert)(\([^)]*\))?!?:\s*/i

function cleanTitle(title) {
  return String(title || '').trim().replace(CC_PREFIX, '').trim()
}

export async function postFeature(env, body) {
  if (!env.DEV_CHANNEL_ID || !env.TELEGRAM_BOT_TOKEN) {
    throw new Error('Bot not configured')
  }
  const rawTitle = String(body?.title || '').trim()
  if (!rawTitle) {
    throw new Error('title required')
  }
  const title = cleanTitle(rawTitle) || rawTitle
  const rawSummary = String(body?.summary || '').trim()
  const url = String(body?.url || '').trim()

  if (!rawSummary) {
    console.info('feature post skipped: empty body', { title: rawTitle })
    return { skipped: 'empty-body' }
  }

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
  } else {
    parts.push('', escapeHtml(truncate(rawSummary, 600)))
  }
  if (url) parts.push('', `<a href="${escapeHtml(url)}">Details on GitHub</a>`)

  await sendMessage(env.TELEGRAM_BOT_TOKEN, {
    chat_id: env.DEV_CHANNEL_ID,
    text: parts.join('\n'),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  })
  return { posted: true }
}
