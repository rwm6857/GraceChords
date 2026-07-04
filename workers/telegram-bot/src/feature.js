// POST /internal/feature — called by the GitHub Action on merged PRs that
// pass the workflow's gating (feat-prefix, or "#post"/label override). Body
// is the PR title, summary, URL, and a `force` flag.
//
// The audience here is worship leaders and musicians, not engineers, so the
// gating and tone lean end-user:
//   - Backend-only changes (CLI tooling, the worker, CI, deps, DB, etc.) are
//     skipped unless the author explicitly opts in (`force`). A shiny new
//     command-line tool means nothing to someone leading Sunday worship.
//   - The conventional-commit prefix (e.g. "feat(scope):") is stripped from
//     the title before anything is posted to end users.
//   - If the PR body is empty, the post is skipped entirely. Empty bodies
//     produced uselessly generic AI summaries; we'd rather say nothing.
//   - Otherwise the body is rewritten by Workers AI for a warm, friendly
//     tone. Any AI failure falls back to the raw body (truncated) so an
//     outage never silently drops a real announcement.
//   - We link to the app itself ("Check it out"), never to GitHub — a PR
//     link is dev noise to the people this channel is for.

import { sendMessage } from './telegram.js'
import { summarizeFeature } from './aiSummary.js'

const APP_URL = 'https://www.gracechords.com'

// Conventional-commit scopes that describe plumbing, not something a worship
// leader can see or use in the app. A merged `feat(cli)` or `feat(worker)`
// shouldn't reach end users unless the author explicitly forces the post.
// User-facing scopes (web, mobile, app, ui, song, setlist, …) are NOT here,
// so they announce by default.
const BACKEND_SCOPES = new Set([
  'cli', 'tool', 'tools', 'tooling', 'ingest', 'ingestion', 'script', 'scripts',
  'bot', 'worker', 'workers', 'telegram', 'push',
  'ci', 'build', 'infra', 'deploy', 'release', 'dep', 'deps', 'dependencies',
  'test', 'tests', 'e2e', 'lint',
  'db', 'database', 'migration', 'migrations', 'supabase', 'sql',
  'api', 'backend', 'server', 'proxy', 'edge', 'functions',
  'repo', 'monorepo', 'config', 'docs', 'doc',
])

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

// Pull the scope out of a conventional-commit title, e.g. "feat(cli): …" →
// "cli". Multi-scope titles ("feat(cli,web): …") split into tokens.
const CC_SCOPE = /^(?:feat|fix|chore|refactor|docs|style|test|ci|build|perf|revert)\(([^)]+)\)!?:/i

// A title is backend-only when it carries a scope and EVERY token in that
// scope is plumbing. "feat(cli): …" → skip; "feat(cli,web): …" → keep,
// because "web" is user-facing. No scope at all → keep (can't tell, so we
// err toward announcing).
function isBackendOnly(rawTitle) {
  const m = CC_SCOPE.exec(String(rawTitle || '').trim())
  if (!m) return false
  const tokens = m[1]
    .toLowerCase()
    .split(/[,/\s]+/)
    .map(t => t.trim())
    .filter(Boolean)
  if (tokens.length === 0) return false
  return tokens.every(t => BACKEND_SCOPES.has(t))
}

export async function postFeature(env, body) {
  if (!env.DEV_CHANNEL_ID || !env.TELEGRAM_BOT_TOKEN) {
    throw new Error('Bot not configured')
  }
  const rawTitle = String(body?.title || '').trim()
  if (!rawTitle) {
    throw new Error('title required')
  }
  // `force` is set by the Action when the author opted in via the `post`
  // label or a "#post" marker. It bypasses the backend-scope skip below.
  const force = body?.force === true || body?.force === 'true'

  if (!force && isBackendOnly(rawTitle)) {
    console.info('feature post skipped: backend-only scope', { title: rawTitle })
    return { skipped: 'backend-scope' }
  }

  const title = cleanTitle(rawTitle) || rawTitle
  const rawSummary = String(body?.summary || '').trim()

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

  const parts = [`<b>🎉 ${escapeHtml(title)}</b>`]
  if (aiBody) {
    parts.push('', aiBody)
  } else {
    parts.push('', escapeHtml(truncate(rawSummary, 600)))
  }
  // Always send people to the app, never to the PR. A GitHub link is the
  // single most "dev-y" thing this channel used to do.
  parts.push('', `<a href="${APP_URL}">Check it out →</a>`)

  await sendMessage(env.TELEGRAM_BOT_TOKEN, {
    chat_id: env.DEV_CHANNEL_ID,
    text: parts.join('\n'),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  })
  return { posted: true }
}
