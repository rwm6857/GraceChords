// Maintained local blocklist for the reflections moderation Layer 1. This is a
// FAST, cheap reject for obviously-disallowed terms before any AI call — the
// OpenAI moderation layer (Layer 2) is the real safety net for nuanced
// hate/harassment/sexual content. Keep this list conservative: false positives
// here block legitimate devotional writing.
//
// Matching is case-insensitive, on word boundaries, after light leetspeak
// normalization (see _moderation.js normalizeForMatch). Add terms as lowercase
// bare words; the matcher handles boundaries and common character substitutions.
//
// Admin maintains this in-repo (versioned, no per-request DB query). A term list
// deliberately avoids being exhaustive — it catches the blatant cases the AI
// layer shouldn't have to spend a call on.

export const BLOCKLIST = [
  // Common profanity
  'fuck',
  'shit',
  'bitch',
  'cunt',
  'asshole',
  'bastard',
  'dickhead',
  'motherfucker',
  // Slurs (non-exhaustive; the AI layer covers the long tail)
  'nigger',
  'faggot',
  'retard',
  'kike',
  'spic',
  'chink',
  'tranny',
]
