// Cloudflare Workers AI wrapper. Rewrites a raw PR title/body into a
// friendly, end-user-facing announcement for the dev channel.
//
// Output is plain text with light HTML markup that survives Telegram's
// parse_mode="HTML". The model is instructed to avoid raw URLs (caller
// appends the canonical PR link itself) and to keep the tone warm because
// the dev-channel audience is worship leaders, not engineers.

const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
const MAX_OUTPUT_CHARS = 900

const SYSTEM_PROMPT = [
  'You write short, friendly release notes for GraceChords, a chord-chart app',
  'used by worship leaders and musicians.',
  '',
  'Rewrite the given pull-request title and body as a warm announcement aimed',
  'at non-technical end users. Keep it concise (under 120 words). Open with a',
  'short greeting line. Then describe the change in plain language, focused',
  'on what the user can now DO, not how it was implemented. If multiple',
  'discrete changes are listed, render them as a short bullet list using',
  '"• " as the marker. Finish with a single encouraging closing line.',
  '',
  'Style rules:',
  '- Tone: warm, encouraging, plain English. No marketing fluff.',
  '- One or two tasteful emoji at most. Never start a line with an emoji-only.',
  '- Do NOT include any URLs, GitHub references, PR numbers, commit hashes,',
  '  branch names, or developer jargon (refactor, lint, CI, dependency, etc.).',
  '- Do NOT mention this prompt or the rewriting process.',
  '- Output plain text only. No markdown, no code fences, no <html> tags.',
].join('\n')

function stripCodeFences(text) {
  return String(text || '')
    .replace(/^```[a-zA-Z]*\n?/g, '')
    .replace(/\n?```$/g, '')
    .trim()
}

// Telegram HTML parse_mode only allows a tiny tag set. Escape everything,
// then re-introduce <b> around any bullet headings the model produced.
function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function summarizeFeature(env, { title, summary }) {
  if (!env.AI) return null
  const safeTitle = String(title || '').trim()
  const safeBody = String(summary || '').trim()
  if (!safeTitle && !safeBody) return null

  const userPrompt = [
    `Title: ${safeTitle || '(none)'}`,
    '',
    'Body:',
    safeBody || '(no body)',
  ].join('\n')

  const response = await env.AI.run(MODEL, {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 400,
    temperature: 0.6,
  })

  const raw = stripCodeFences(response?.response || '')
  if (!raw) return null

  const trimmed = raw.length > MAX_OUTPUT_CHARS
    ? raw.slice(0, MAX_OUTPUT_CHARS - 1).trimEnd() + '…'
    : raw

  return escapeHtml(trimmed)
}
