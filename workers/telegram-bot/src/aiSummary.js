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
  'You write short, warm announcements for GraceChords, a chord-chart and',
  'worship app used by worship leaders, musicians, and the people they lead.',
  '',
  'Rewrite the given pull-request title and body as a friendly note to the',
  'GraceChords community — write it the way you would tell a friend about',
  'something new, NOT the way you would write release notes or a changelog.',
  '',
  'Shape:',
  '- Open with a warm, welcoming line to the community (e.g. "Hey GraceChords',
  '  family!" or "Good news, everyone!"). Vary the opener; do not reuse the',
  '  same one every time.',
  '- Say what the user can now DO and why it helps them — leading worship,',
  '  playing together, singing in their own language. A couple of short',
  '  sentences is plenty.',
  '- Use a bullet list ("• " marker) ONLY when there are genuinely two or',
  '  more separate things a user would notice. For a single change, write',
  '  flowing sentences — never a one-item bullet or a "Key updates include:"',
  '  style heading.',
  '- Close with one short, encouraging line (e.g. "Can\'t wait to see how you',
  '  use it!").',
  '',
  'Style rules:',
  '- Tone: warm, personal, encouraging, plain English. Sound like a person',
  '  who is glad to share, not a product update.',
  '- Keep it under 110 words.',
  '- Be specific. Name the actual feature, page, or thing the user gets.',
  '  Reuse at least one concrete noun from the title or body verbatim.',
  '- Banned phrases (they read cold or corporate): "Key updates include",',
  '  "Here\'s what\'s new", "Please note", "improvements", "enhancements",',
  '  "more reliable", "smoothly", "helpful information", "great music",',
  '  "experience", "behind the scenes". If the change is so small you can',
  '  only describe it with these, output exactly the single word SKIP and',
  '  nothing else.',
  '- One or two tasteful emoji at most. Never make a line that is only an emoji.',
  '- Never mention developer things: GitHub, pull requests, PR numbers,',
  '  commits, branches, command-line or CLI tools, code, refactors, tests,',
  '  CI, deploys, dependencies, or "the repo". None of that matters to a',
  '  worship leader.',
  '- Do NOT include any URLs — the app link is added for you.',
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

  // SKIP is the model's escape hatch when the source is too thin to write
  // a non-generic note. Treat it the same as a failed rewrite — caller
  // falls back to the raw body. We match defensively because the model
  // sometimes wraps the keyword in quotes or punctuation.
  if (/^["']?\s*SKIP\s*["']?\.?\s*$/i.test(raw)) return null

  const trimmed = raw.length > MAX_OUTPUT_CHARS
    ? raw.slice(0, MAX_OUTPUT_CHARS - 1).trimEnd() + '…'
    : raw

  return escapeHtml(trimmed)
}
